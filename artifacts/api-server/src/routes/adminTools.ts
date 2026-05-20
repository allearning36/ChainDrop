import { Router, type IRouter } from "express";
import { eq, desc, asc, and, ilike, count as drizzleCount } from "drizzle-orm";
import crypto from "crypto";
import { db, claimsTable, chainsTable, blockedAddressesTable, settingsTable } from "@workspace/db";
import { requireAdmin } from "../lib/adminAuth";
import { getWalletBalance } from "../lib/faucet";

const router: IRouter = Router();

// ── Password helpers ────────────────────────────────────────────────────────
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

export async function getStoredPasswordHash(): Promise<string | null> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "adminPasswordHash"));
  return row?.value ?? null;
}

// ── Change Password ─────────────────────────────────────────────────────────
router.post("/admin/change-password", requireAdmin, async (req, res): Promise<void> => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword are required" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }

  // Verify current password (DB hash first, fall back to env)
  const storedHash = await getStoredPasswordHash();
  let valid = false;
  if (storedHash) {
    valid = verifyPassword(currentPassword, storedHash);
  } else {
    valid = currentPassword === (process.env.ADMIN_PASSWORD ?? "");
  }

  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const newHash = hashPassword(newPassword);
  await db
    .insert(settingsTable)
    .values({ key: "adminPasswordHash", value: newHash })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: newHash } });

  res.json({ ok: true });
});

// ── Claims Log ──────────────────────────────────────────────────────────────
router.get("/admin/claims", requireAdmin, async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt((req.query.page as string) ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? "50")));
  const offset = (page - 1) * limit;
  const addressFilter = (req.query.address as string)?.toLowerCase().trim();
  const chainId = req.query.chainId ? parseInt(req.query.chainId as string) : null;

  const conditions: ReturnType<typeof eq>[] = [];
  if (addressFilter) conditions.push(ilike(claimsTable.address, `%${addressFilter}%`) as ReturnType<typeof eq>);
  if (chainId && !isNaN(chainId)) conditions.push(eq(claimsTable.chainId, chainId));

  const where = conditions.length > 0 ? and(...(conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]])) : undefined;

  const [rows, [{ total }], chains] = await Promise.all([
    db.select().from(claimsTable).where(where).orderBy(desc(claimsTable.claimedAt)).limit(limit).offset(offset),
    db.select({ total: drizzleCount() }).from(claimsTable).where(where),
    db.select({ id: chainsTable.id, name: chainsTable.name, symbol: chainsTable.symbol }).from(chainsTable),
  ]);

  const chainMap = Object.fromEntries(chains.map(c => [c.id, c]));

  res.json({
    claims: rows.map(r => ({
      id: r.id,
      address: r.address,
      chainId: r.chainId,
      chainName: chainMap[r.chainId]?.name ?? `Chain ${r.chainId}`,
      chainSymbol: chainMap[r.chainId]?.symbol ?? "",
      txHash: r.txHash,
      amount: r.amount,
      claimedAt: r.claimedAt.toISOString(),
    })),
    total: Number(total),
    page,
    limit,
    pages: Math.ceil(Number(total) / limit),
  });
});

// Claims CSV export
router.get("/admin/claims/export", requireAdmin, async (_req, res): Promise<void> => {
  const [rows, chains] = await Promise.all([
    db.select().from(claimsTable).orderBy(desc(claimsTable.claimedAt)),
    db.select({ id: chainsTable.id, name: chainsTable.name, symbol: chainsTable.symbol }).from(chainsTable),
  ]);
  const chainMap = Object.fromEntries(chains.map(c => [c.id, c]));

  const header = "id,address,chain,symbol,amount,txHash,claimedAt\n";
  const lines = rows.map(r =>
    [r.id, r.address, chainMap[r.chainId]?.name ?? r.chainId, chainMap[r.chainId]?.symbol ?? "", r.amount, r.txHash, r.claimedAt.toISOString()].join(",")
  ).join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="claims-${Date.now()}.csv"`);
  res.send(header + lines);
});

// ── Blocked Addresses ────────────────────────────────────────────────────────
router.get("/admin/blocked-addresses", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(blockedAddressesTable).orderBy(desc(blockedAddressesTable.blockedAt));
  res.json(rows.map(r => ({ address: r.address, reason: r.reason, blockedAt: r.blockedAt.toISOString() })));
});

router.post("/admin/blocked-addresses", requireAdmin, async (req, res): Promise<void> => {
  const { address, reason } = req.body as { address?: string; reason?: string };
  if (!address || typeof address !== "string") {
    res.status(400).json({ error: "address is required" });
    return;
  }
  const normalized = address.toLowerCase().trim();
  if (!/^0x[0-9a-f]{40}$/i.test(normalized)) {
    res.status(400).json({ error: "Invalid EVM address" });
    return;
  }
  const [row] = await db
    .insert(blockedAddressesTable)
    .values({ address: normalized, reason: (reason ?? "").trim() })
    .onConflictDoUpdate({ target: blockedAddressesTable.address, set: { reason: (reason ?? "").trim() } })
    .returning();
  res.status(201).json({ address: row!.address, reason: row!.reason, blockedAt: row!.blockedAt.toISOString() });
});

router.delete("/admin/blocked-addresses/:address", requireAdmin, async (req, res): Promise<void> => {
  const address = (req.params.address as string).toLowerCase().trim();
  await db.delete(blockedAddressesTable).where(eq(blockedAddressesTable.address, address));
  res.sendStatus(204);
});

// ── Wallet Health ────────────────────────────────────────────────────────────
router.get("/admin/wallet-health", requireAdmin, async (_req, res): Promise<void> => {
  const chains = await db.select().from(chainsTable).orderBy(asc(chainsTable.sortOrder), asc(chainsTable.id));

  const results = await Promise.allSettled(
    chains.map(async c => ({
      id: c.id,
      name: c.name,
      symbol: c.symbol,
      logoUrl: c.logoUrl,
      isTestnet: c.isTestnet,
      isEnabled: c.isEnabled,
      walletAddress: c.walletAddress,
      claimAmount: c.claimAmount,
      balance: await getWalletBalance(c.rpcUrl, c.walletAddress),
    }))
  );

  res.json(
    results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { id: chains[i]!.id, name: chains[i]!.name, symbol: chains[i]!.symbol, logoUrl: chains[i]!.logoUrl, isTestnet: chains[i]!.isTestnet, isEnabled: chains[i]!.isEnabled, walletAddress: chains[i]!.walletAddress, claimAmount: chains[i]!.claimAmount, balance: null }
    )
  );
});

export default router;
