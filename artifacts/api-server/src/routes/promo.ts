import { Router, type IRouter, type Request } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, chainsTable, promoCodesTable, promoClaimsTable, ipBlocksTable } from "@workspace/db";
import { sendTokens, isValidAddress, type ChainType } from "../lib/chains/index";
import { parseRpcUrls } from "../lib/rpcFailover";
import { broadcastError } from "../lib/liveEvents";
import { resolveChainPrivateKey } from "../lib/encryption";
import { requireAdmin } from "../lib/adminAuth";

function getClientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "unknown";
}

function parseId(raw: string | string[] | undefined): number | null {
  if (typeof raw !== "string") return null;
  const n = parseInt(raw);
  return isNaN(n) ? null : n;
}

const router: IRouter = Router();

// ── Public: check if a chain has an active promo ──────────────────────────────
router.get("/promo/chain/:chainId", async (req, res): Promise<void> => {
  const chainId = parseId(req.params["chainId"]);
  if (chainId === null || chainId <= 0) { res.status(400).json({ error: "Invalid chainId" }); return; }

  try {
    const now = new Date();
    const [promo] = await db
      .select()
      .from(promoCodesTable)
      .where(and(
        eq(promoCodesTable.chainId, chainId),
        eq(promoCodesTable.isActive, true),
      ))
      .limit(1);

    if (!promo) { res.json({ active: false }); return; }
    if (promo.expiresAt && promo.expiresAt < now) { res.json({ active: false }); return; }
    if (promo.usedCount >= promo.maxClaims) { res.json({ active: false }); return; }

    res.json({
      active: true,
      claimAmount: promo.claimAmount,
      codeLink: promo.codeLink ?? null,
      successMessage: promo.successMessage ?? null,
    });
  } catch {
    res.json({ active: false });
  }
});

// ── Public: recent promo claims (for RecentFeed) ──────────────────────────────
router.get("/promo/recent", async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        id:          promoClaimsTable.id,
        address:     promoClaimsTable.address,
        txHash:      promoClaimsTable.txHash,
        claimedAt:   promoClaimsTable.claimedAt,
        amount:      promoCodesTable.claimAmount,
        chainId:     promoCodesTable.chainId,
        chainName:   chainsTable.name,
        symbol:      chainsTable.symbol,
        logoUrl:     chainsTable.logoUrl,
        explorerUrl: chainsTable.explorerUrl,
      })
      .from(promoClaimsTable)
      .innerJoin(promoCodesTable, eq(promoClaimsTable.promoId, promoCodesTable.id))
      .innerJoin(chainsTable, eq(promoCodesTable.chainId, chainsTable.id))
      .orderBy(desc(promoClaimsTable.claimedAt))
      .limit(50);
    res.json(rows);
  } catch {
    res.json([]);
  }
});

// ── Public: claim with promo code ─────────────────────────────────────────────
router.post("/promo/claim", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const chainId = typeof body["chainId"] === "number" ? body["chainId"] : parseInt(String(body["chainId"] ?? ""));
  const address  = typeof body["address"] === "string" ? body["address"].trim() : "";
  const code     = typeof body["code"] === "string" ? body["code"].trim().toUpperCase() : "";

  if (isNaN(chainId) || chainId <= 0 || !address || !code) {
    res.status(400).json({ error: "Invalid request — chainId, address and code are required." }); return;
  }

  const clientIp = getClientIp(req);

  // IP block check
  try {
    const [blockedIp] = await db.select().from(ipBlocksTable).where(eq(ipBlocksTable.ip, clientIp)).limit(1);
    if (blockedIp) { res.status(403).json({ error: "Your IP address has been blocked." }); return; }
  } catch { /* non-fatal */ }

  // Load chain
  const [chain] = await db.select().from(chainsTable).where(eq(chainsTable.id, chainId)).limit(1);
  if (!chain || !chain.isEnabled) { res.status(404).json({ error: "Chain not found or disabled." }); return; }

  const chainType = chain.chainType as ChainType;

  // Validate address format
  let addressValid = false;
  try { addressValid = await isValidAddress(chainType, address, chain.addressRegex); } catch { /* treat as invalid */ }
  if (!addressValid) { res.status(400).json({ error: "Invalid wallet address for this chain." }); return; }

  const normalizedAddress = address.toLowerCase();

  // Load promo code
  const [promo] = await db.select().from(promoCodesTable)
    .where(and(eq(promoCodesTable.code, code), eq(promoCodesTable.chainId, chainId)))
    .limit(1);

  if (!promo) { res.status(404).json({ error: "Invalid promo code." }); return; }
  if (!promo.isActive) { res.status(400).json({ error: "This promo code is no longer active." }); return; }
  if (promo.expiresAt && promo.expiresAt < new Date()) { res.status(400).json({ error: "This promo code has expired." }); return; }
  if (promo.usedCount >= promo.maxClaims) { res.status(400).json({ error: "This promo code has reached its claim limit." }); return; }

  // Duplicate check — same address already claimed this promo
  const [existingAddrClaim] = await db.select({ id: promoClaimsTable.id })
    .from(promoClaimsTable)
    .where(and(eq(promoClaimsTable.promoId, promo.id), eq(promoClaimsTable.address, normalizedAddress)))
    .limit(1);
  if (existingAddrClaim) { res.status(429).json({ error: "You have already claimed this promo code." }); return; }

  // IP duplicate check — same IP already claimed this promo
  if (clientIp && clientIp !== "unknown") {
    const [existingIpClaim] = await db.select({ id: promoClaimsTable.id })
      .from(promoClaimsTable)
      .where(and(eq(promoClaimsTable.promoId, promo.id), eq(promoClaimsTable.ip, clientIp)))
      .limit(1);
    if (existingIpClaim) { res.status(429).json({ error: "A claim from your IP has already been made for this promo." }); return; }
  }

  // Send tokens
  let txHash: string;
  try {
    const privateKey = resolveChainPrivateKey(chain.privateKey);
    const result = await sendTokens(
      chainType,
      parseRpcUrls(chain.rpcUrls, chain.rpcUrl),
      privateKey,
      address,
      promo.claimAmount,
      { gasPriceGwei: chain.gasPriceGwei, gasLimit: chain.gasLimit },
    );
    txHash = result.txHash;
  } catch (err) {
    broadcastError("claim_error", err, { chainId, chainName: chain.name, address: normalizedAddress, ip: clientIp });
    res.status(500).json({ error: "Transaction failed. Please try again." });
    return;
  }

  // Record claim + increment used_count
  await db.insert(promoClaimsTable).values({
    promoId:   promo.id,
    address:   normalizedAddress,
    ip:        clientIp,
    txHash,
  });

  await db.update(promoCodesTable)
    .set({ usedCount: promo.usedCount + 1 })
    .where(eq(promoCodesTable.id, promo.id));

  res.json({
    success: true,
    txHash,
    amount: promo.claimAmount,
    explorerUrl: chain.explorerUrl,
    successMessage: promo.successMessage ?? null,
  });
});

// ── Admin: list all promo codes ───────────────────────────────────────────────
router.get("/admin/promo", requireAdmin, async (_req, res): Promise<void> => {
  const promos = await db.select().from(promoCodesTable).orderBy(desc(promoCodesTable.createdAt));
  res.json(promos);
});

// ── Admin: create promo code ───────────────────────────────────────────────────
router.post("/admin/promo", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const code           = typeof body["code"] === "string" ? body["code"].trim().toUpperCase() : "";
  const chainId        = typeof body["chainId"] === "number" ? body["chainId"] : parseInt(String(body["chainId"] ?? ""));
  const claimAmount    = typeof body["claimAmount"] === "string" ? body["claimAmount"].trim() : "";
  const maxClaims      = typeof body["maxClaims"] === "number" ? body["maxClaims"] : parseInt(String(body["maxClaims"] ?? "100"));
  const note           = typeof body["note"] === "string" ? body["note"].trim() || null : null;
  const codeLink       = typeof body["codeLink"] === "string" ? body["codeLink"].trim() || null : null;
  const successMessage = typeof body["successMessage"] === "string" ? body["successMessage"].trim() || null : null;
  const expiresAt      = typeof body["expiresAt"] === "string" && body["expiresAt"] ? new Date(body["expiresAt"]) : null;

  if (!code || code.length < 3 || code.length > 32) { res.status(400).json({ error: "Code must be 3–32 characters." }); return; }
  if (isNaN(chainId) || chainId <= 0) { res.status(400).json({ error: "Invalid chainId." }); return; }
  if (!claimAmount) { res.status(400).json({ error: "claimAmount is required." }); return; }
  if (isNaN(maxClaims) || maxClaims <= 0) { res.status(400).json({ error: "maxClaims must be a positive integer." }); return; }

  const [chain] = await db.select({ id: chainsTable.id }).from(chainsTable).where(eq(chainsTable.id, chainId)).limit(1);
  if (!chain) { res.status(404).json({ error: "Chain not found" }); return; }

  const [existing] = await db.select({ id: promoCodesTable.id }).from(promoCodesTable).where(eq(promoCodesTable.code, code)).limit(1);
  if (existing) { res.status(409).json({ error: "Promo code already exists" }); return; }

  const [created] = await db.insert(promoCodesTable).values({
    code, chainId, claimAmount, maxClaims,
    note, codeLink, successMessage, expiresAt, isActive: true, usedCount: 0,
  }).returning();

  res.status(201).json(created);
});

// ── Admin: toggle active status ────────────────────────────────────────────────
router.patch("/admin/promo/:id/toggle", requireAdmin, async (req, res): Promise<void> => {
  const id = parseId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [promo] = await db.select().from(promoCodesTable).where(eq(promoCodesTable.id, id)).limit(1);
  if (!promo) { res.status(404).json({ error: "Promo not found" }); return; }

  const [updated] = await db.update(promoCodesTable)
    .set({ isActive: !promo.isActive })
    .where(eq(promoCodesTable.id, id))
    .returning();

  res.json(updated);
});

// ── Admin: delete promo code ───────────────────────────────────────────────────
router.delete("/admin/promo/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(promoClaimsTable).where(eq(promoClaimsTable.promoId, id));
  await db.delete(promoCodesTable).where(eq(promoCodesTable.id, id));
  res.json({ success: true });
});

// ── Admin: list claims for a promo ─────────────────────────────────────────────
router.get("/admin/promo/:id/claims", requireAdmin, async (req, res): Promise<void> => {
  const id = parseId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const claims = await db.select().from(promoClaimsTable)
    .where(eq(promoClaimsTable.promoId, id))
    .orderBy(desc(promoClaimsTable.claimedAt));
  res.json(claims);
});

export default router;
