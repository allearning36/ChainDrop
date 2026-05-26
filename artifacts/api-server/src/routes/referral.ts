import { Router } from "express";
import { randomUUID } from "crypto";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  referralsTable,
  referralCommissionsTable,
  referralClaimRequestsTable,
  referralBalanceAdjustmentsTable,
  chainsTable,
} from "@workspace/db/schema";
import { requireAdmin } from "../lib/adminAuth";
import { getReferralSettings, saveReferralSettings, verifySignature } from "../lib/referral";
import { sendTokens, type ChainType } from "../lib/chains/index";
import { parseRpcUrls } from "../lib/rpcFailover";
import { resolveChainPrivateKey } from "../lib/encryption";
import { logger } from "../lib/logger";

const router = Router();

// ── In-memory nonce store (wallet → {nonce, expiresAt}) ──────────────────────
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();

function cleanNonces() {
  const now = Date.now();
  for (const [k, v] of nonceStore) {
    if (v.expiresAt < now) nonceStore.delete(k);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /referral/settings
// ─────────────────────────────────────────────────────────────────────────────
router.get("/referral/settings", async (_req, res): Promise<void> => {
  const s = await getReferralSettings();
  res.json({
    enabled: s.enabled,
    maintenanceMode: s.maintenanceMode,
    maintenanceMessage: s.maintenanceMessage,
    commissionOnExchange: s.commissionOnExchange,
    commissionOnBuy: s.commissionOnBuy,
    exchangeLevel1Pct: s.exchangeLevel1Pct,
    exchangeLevel2Pct: s.exchangeLevel2Pct,
    buyLevel1Pct: s.buyLevel1Pct,
    buyLevel2Pct: s.buyLevel2Pct,
    faucetClaimChainCommissions: s.faucetClaimChainCommissions,
    claimChainIds: s.claimChainIds,
    minClaimEth: s.minClaimEth,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /referral/nonce/:wallet
// ─────────────────────────────────────────────────────────────────────────────
router.get("/referral/nonce/:wallet", (req, res): void => {
  cleanNonces();
  const wallet = req.params.wallet!.toLowerCase();
  const nonce = randomUUID();
  nonceStore.set(wallet, { nonce, expiresAt: Date.now() + 5 * 60 * 1000 });
  const message = `ChainDrop Referral Claim\nWallet: ${wallet}\nNonce: ${nonce}`;
  res.json({ nonce, message });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /referral/dashboard/:wallet
// ─────────────────────────────────────────────────────────────────────────────
router.get("/referral/dashboard/:wallet", async (req, res): Promise<void> => {
  const wallet = req.params.wallet!.toLowerCase();

  const frontendUrl = process.env.FRONTEND_URL?.trim() ||
    (() => {
      const domains = (process.env.REPLIT_DOMAINS ?? "").split(",").map(d => d.trim()).filter(Boolean);
      return domains.length > 0 ? `https://${domains[0]}` : "https://chaindrop.app";
    })();
  const referralLink = `${frontendUrl}/?ref=${wallet}`;

  const [level1, level2, commissions, claimRequests, adjustments] = await Promise.all([
    db.select().from(referralsTable).where(and(eq(referralsTable.referrerAddress, wallet), eq(referralsTable.level, 1))),
    db.select().from(referralsTable).where(and(eq(referralsTable.referrerAddress, wallet), eq(referralsTable.level, 2))),
    db.select().from(referralCommissionsTable)
      .where(eq(referralCommissionsTable.referrerAddress, wallet))
      .orderBy(desc(referralCommissionsTable.createdAt))
      .limit(100),
    db.select().from(referralClaimRequestsTable)
      .where(eq(referralClaimRequestsTable.walletAddress, wallet))
      .orderBy(desc(referralClaimRequestsTable.createdAt))
      .limit(50),
    db.select().from(referralBalanceAdjustmentsTable)
      .where(eq(referralBalanceAdjustmentsTable.walletAddress, wallet))
      .orderBy(desc(referralBalanceAdjustmentsTable.createdAt))
      .limit(50),
  ]);

  const totalEarned = commissions.reduce((s, c) => s + parseFloat(c.amountEth), 0);
  const alreadyRequested = claimRequests
    .filter(r => r.status === "approved" || r.status === "pending")
    .reduce((s, r) => s + parseFloat(r.amountEth), 0);
  const pendingCommission = commissions
    .filter(c => c.status === "pending")
    .reduce((s, c) => s + parseFloat(c.amountEth), 0);
  // Admin adjustments affect claimable balance
  const adjustmentDelta = adjustments.reduce((s, a) => {
    return a.type === "add" ? s + parseFloat(a.amountEth) : s - parseFloat(a.amountEth);
  }, 0);
  const claimable = Math.max(0, pendingCommission + adjustmentDelta - alreadyRequested);

  res.json({
    wallet,
    referralCode: wallet,
    referralLink,
    level1Count: level1.length,
    level2Count: level2.length,
    pendingCommissionEth: pendingCommission.toFixed(10),
    totalEarnedEth: totalEarned.toFixed(10),
    claimableEth: claimable.toFixed(10),
    commissions: commissions.map(c => ({
      id: c.id,
      refereeAddress: c.refereeAddress,
      level: c.level,
      sourceType: c.sourceType,
      chainId: c.chainId,
      amountEth: c.amountEth,
      commissionPct: c.commissionPct,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
    })),
    claimRequests: claimRequests.map(r => ({
      id: r.id,
      amountEth: r.amountEth,
      claimChainId: r.claimChainId,
      status: r.status,
      adminNote: r.adminNote ?? null,
      txHash: r.txHash ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    adjustments: adjustments.map(a => ({
      id: a.id,
      walletAddress: a.walletAddress,
      type: a.type,
      amountEth: a.amountEth,
      note: a.note ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: POST /referral/register
// ─────────────────────────────────────────────────────────────────────────────
router.post("/referral/register", async (req, res): Promise<void> => {
  const { referrerAddress, refereeAddress } = req.body ?? {};
  if (!referrerAddress || !refereeAddress || typeof referrerAddress !== "string" || typeof refereeAddress !== "string") {
    res.status(400).json({ error: "referrerAddress and refereeAddress are required" });
    return;
  }
  const referrer = referrerAddress.toLowerCase();
  const referee = refereeAddress.toLowerCase();

  if (referrer === referee) {
    res.json({ registered: false, message: "Cannot refer yourself" });
    return;
  }

  const settings = await getReferralSettings();
  if (!settings.enabled) {
    res.json({ registered: false, message: "Referral system is disabled" });
    return;
  }

  const [existing] = await db.select().from(referralsTable).where(eq(referralsTable.refereeAddress, referee)).limit(1);
  if (existing) {
    res.json({ registered: false, message: "Already referred" });
    return;
  }

  // Prevent circular referrals
  const [circular] = await db.select().from(referralsTable).where(
    and(eq(referralsTable.refereeAddress, referrer), eq(referralsTable.referrerAddress, referee))
  ).limit(1);
  if (circular) {
    res.json({ registered: false, message: "Circular referral not allowed" });
    return;
  }

  await db.insert(referralsTable).values({ referrerAddress: referrer, refereeAddress: referee, level: 1 });

  // Also insert level-2 row for referrer's own referrer
  const [refReferral] = await db.select().from(referralsTable)
    .where(eq(referralsTable.refereeAddress, referrer)).limit(1);
  if (refReferral) {
    const [dup] = await db.select().from(referralsTable).where(
      and(eq(referralsTable.referrerAddress, refReferral.referrerAddress), eq(referralsTable.refereeAddress, referee))
    ).limit(1);
    if (!dup) {
      await db.insert(referralsTable).values({ referrerAddress: refReferral.referrerAddress, refereeAddress: referee, level: 2 });
    }
  }

  res.json({ registered: true, message: "Referral registered" });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: POST /referral/claim-request
// ─────────────────────────────────────────────────────────────────────────────
router.post("/referral/claim-request", async (req, res): Promise<void> => {
  const { wallet, signature, nonce, claimChainId } = req.body ?? {};
  if (!wallet || !signature || !nonce || !claimChainId) {
    res.status(400).json({ error: "wallet, signature, nonce, and claimChainId are required" });
    return;
  }
  const walletLower = (wallet as string).toLowerCase();

  const settings = await getReferralSettings();
  if (!settings.enabled || settings.maintenanceMode) {
    res.status(400).json({ error: settings.maintenanceMessage || "Referral system unavailable" });
    return;
  }

  cleanNonces();
  const stored = nonceStore.get(walletLower);
  if (!stored || stored.nonce !== nonce || stored.expiresAt < Date.now()) {
    res.status(400).json({ error: "Invalid or expired nonce. Please request a new one." });
    return;
  }

  const message = `ChainDrop Referral Claim\nWallet: ${walletLower}\nNonce: ${nonce}`;
  if (!verifySignature(walletLower, message, signature as string)) {
    res.status(400).json({ error: "Signature verification failed" });
    return;
  }

  nonceStore.delete(walletLower);

  const [commissions, existingRequests, adjustments] = await Promise.all([
    db.select().from(referralCommissionsTable).where(
      and(eq(referralCommissionsTable.referrerAddress, walletLower), eq(referralCommissionsTable.status, "pending"))
    ),
    db.select().from(referralClaimRequestsTable)
      .where(eq(referralClaimRequestsTable.walletAddress, walletLower)),
    db.select().from(referralBalanceAdjustmentsTable)
      .where(eq(referralBalanceAdjustmentsTable.walletAddress, walletLower)),
  ]);

  const totalPending = commissions.reduce((s, c) => s + parseFloat(c.amountEth), 0);
  const alreadyRequested = existingRequests
    .filter(r => r.status === "approved" || r.status === "pending")
    .reduce((s, r) => s + parseFloat(r.amountEth), 0);
  const adjustmentDelta = adjustments.reduce((s, a) =>
    a.type === "add" ? s + parseFloat(a.amountEth) : s - parseFloat(a.amountEth), 0);
  const claimable = Math.max(0, totalPending + adjustmentDelta - alreadyRequested);

  if (claimable < settings.minClaimEth) {
    res.status(400).json({
      error: `Minimum claimable amount is ${settings.minClaimEth} ETH. You have ${claimable.toFixed(6)} ETH available.`,
    });
    return;
  }

  if (settings.claimChainIds.length > 0 && !settings.claimChainIds.includes(Number(claimChainId))) {
    res.status(400).json({ error: "This chain is not allowed for commission claims" });
    return;
  }

  const [request] = await db.insert(referralClaimRequestsTable).values({
    walletAddress: walletLower,
    amountEth: claimable.toFixed(10),
    claimChainId: Number(claimChainId),
    signature: signature as string,
    nonce: nonce as string,
    status: "pending",
  }).returning();

  res.json({ id: request!.id, amountEth: request!.amountEth, status: request!.status });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET /admin/referral/settings
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/referral/settings", requireAdmin, async (_req, res): Promise<void> => {
  const s = await getReferralSettings();
  res.json(s);
});

router.put("/admin/referral/settings", requireAdmin, async (req, res): Promise<void> => {
  const updated = await saveReferralSettings(req.body ?? {});
  res.json(updated);
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET /admin/referral/users
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/referral/users", requireAdmin, async (_req, res): Promise<void> => {
  const allReferrers = await db.selectDistinct({ wallet: referralsTable.referrerAddress }).from(referralsTable);

  const results = await Promise.all(allReferrers.map(async ({ wallet }) => {
    const [l1, l2, commissions, claimReqs] = await Promise.all([
      db.select().from(referralsTable).where(and(eq(referralsTable.referrerAddress, wallet), eq(referralsTable.level, 1))),
      db.select().from(referralsTable).where(and(eq(referralsTable.referrerAddress, wallet), eq(referralsTable.level, 2))),
      db.select().from(referralCommissionsTable).where(eq(referralCommissionsTable.referrerAddress, wallet)),
      db.select().from(referralClaimRequestsTable).where(eq(referralClaimRequestsTable.walletAddress, wallet)),
    ]);
    const totalEth = commissions.reduce((s, c) => s + parseFloat(c.amountEth), 0);
    const pendingEth = commissions.filter(c => c.status === "pending").reduce((s, c) => s + parseFloat(c.amountEth), 0);
    const allRefs = [...l1, ...l2].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return {
      wallet,
      level1Count: l1.length,
      level2Count: l2.length,
      totalCommissionEth: totalEth.toFixed(10),
      pendingCommissionEth: pendingEth.toFixed(10),
      claimRequestCount: claimReqs.length,
      joinedAt: allRefs[0]?.createdAt.toISOString() ?? new Date().toISOString(),
    };
  }));

  res.json(results);
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET /admin/referral/users/:wallet
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/referral/users/:wallet", requireAdmin, async (req, res): Promise<void> => {
  const wallet = String(req.params.wallet).toLowerCase();

  const [level1, level2, commissions, claimRequests] = await Promise.all([
    db.select().from(referralsTable).where(and(eq(referralsTable.referrerAddress, wallet), eq(referralsTable.level, 1))).orderBy(desc(referralsTable.createdAt)),
    db.select().from(referralsTable).where(and(eq(referralsTable.referrerAddress, wallet), eq(referralsTable.level, 2))).orderBy(desc(referralsTable.createdAt)),
    db.select().from(referralCommissionsTable).where(eq(referralCommissionsTable.referrerAddress, wallet)).orderBy(desc(referralCommissionsTable.createdAt)),
    db.select().from(referralClaimRequestsTable).where(eq(referralClaimRequestsTable.walletAddress, wallet)).orderBy(desc(referralClaimRequestsTable.createdAt)),
  ]);

  if (level1.length === 0 && level2.length === 0 && commissions.length === 0) {
    res.status(404).json({ error: "No referral data found for this wallet" });
    return;
  }

  res.json({
    wallet,
    level1Referrals: level1.map(r => ({ id: r.id, refereeAddress: r.refereeAddress, level: r.level, createdAt: r.createdAt.toISOString() })),
    level2Referrals: level2.map(r => ({ id: r.id, refereeAddress: r.refereeAddress, level: r.level, createdAt: r.createdAt.toISOString() })),
    commissions: commissions.map(c => ({
      id: c.id, refereeAddress: c.refereeAddress, level: c.level,
      sourceType: c.sourceType, chainId: c.chainId,
      amountEth: c.amountEth, commissionPct: c.commissionPct,
      status: c.status, createdAt: c.createdAt.toISOString(),
    })),
    claimRequests: claimRequests.map(r => ({
      id: r.id, walletAddress: r.walletAddress, amountEth: r.amountEth,
      claimChainId: r.claimChainId, status: r.status,
      adminNote: r.adminNote ?? null, txHash: r.txHash ?? null,
      createdAt: r.createdAt.toISOString(),
      processedAt: r.processedAt?.toISOString() ?? null,
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: POST /admin/referral/users/:wallet/adjust-balance
// ─────────────────────────────────────────────────────────────────────────────
router.post("/admin/referral/users/:wallet/adjust-balance", requireAdmin, async (req, res): Promise<void> => {
  const wallet = String(req.params.wallet).toLowerCase();
  const { type, amountEth, note } = req.body ?? {};

  if (!type || (type !== "add" && type !== "deduct")) {
    res.status(400).json({ error: "type must be 'add' or 'deduct'" });
    return;
  }
  const amount = parseFloat(String(amountEth));
  if (isNaN(amount) || amount <= 0) {
    res.status(400).json({ error: "amountEth must be a positive number" });
    return;
  }

  const [row] = await db.insert(referralBalanceAdjustmentsTable).values({
    walletAddress: wallet,
    type,
    amountEth: amount.toFixed(10),
    note: note ? String(note) : null,
  }).returning();

  res.json({
    id: row!.id,
    walletAddress: row!.walletAddress,
    type: row!.type,
    amountEth: row!.amountEth,
    note: row!.note ?? null,
    createdAt: row!.createdAt.toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET /admin/referral/claim-requests
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/referral/claim-requests", requireAdmin, async (req, res): Promise<void> => {
  const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
  const rows = await db.select().from(referralClaimRequestsTable).orderBy(desc(referralClaimRequestsTable.createdAt));
  const filtered = statusFilter ? rows.filter(r => r.status === statusFilter) : rows;
  res.json(filtered.map(r => ({
    id: r.id, walletAddress: r.walletAddress, amountEth: r.amountEth,
    claimChainId: r.claimChainId, status: r.status,
    adminNote: r.adminNote ?? null, txHash: r.txHash ?? null,
    createdAt: r.createdAt.toISOString(),
    processedAt: r.processedAt?.toISOString() ?? null,
  })));
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: POST /admin/referral/claim-requests/:id/approve
// ─────────────────────────────────────────────────────────────────────────────
router.post("/admin/referral/claim-requests/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(referralClaimRequestsTable).where(eq(referralClaimRequestsTable.id, id)).limit(1);
  if (!request) { res.status(404).json({ error: "Claim request not found" }); return; }
  if (request.status !== "pending") { res.status(400).json({ error: `Request is already ${request.status}` }); return; }

  const [chain] = await db.select().from(chainsTable).where(eq(chainsTable.id, request.claimChainId)).limit(1);
  if (!chain) { res.status(400).json({ error: "Claim chain not found" }); return; }

  let txHash: string;
  try {
    const chainType = chain.chainType as ChainType;
    const rpcUrls = parseRpcUrls(chain.rpcUrls, chain.rpcUrl);
    const privateKey = resolveChainPrivateKey(chain.privateKey);
    const result = await sendTokens(chainType, rpcUrls, privateKey, request.walletAddress, request.amountEth);
    txHash = result.txHash;
  } catch (err) {
    logger.error({ err, id }, "Failed to send referral commission");
    res.status(500).json({ error: "Failed to send commission. Check faucet wallet balance." });
    return;
  }

  await db
    .update(referralCommissionsTable)
    .set({ status: "paid", claimTxHash: txHash, paidAt: new Date() })
    .where(and(
      eq(referralCommissionsTable.referrerAddress, request.walletAddress),
      eq(referralCommissionsTable.status, "pending")
    ));

  const [updated] = await db
    .update(referralClaimRequestsTable)
    .set({ status: "approved", txHash, processedAt: new Date(), adminNote: req.body?.note ?? null })
    .where(eq(referralClaimRequestsTable.id, id))
    .returning();

  res.json({
    id: updated!.id, walletAddress: updated!.walletAddress, amountEth: updated!.amountEth,
    claimChainId: updated!.claimChainId, status: updated!.status,
    adminNote: updated!.adminNote ?? null, txHash: updated!.txHash ?? null,
    createdAt: updated!.createdAt.toISOString(),
    processedAt: updated!.processedAt?.toISOString() ?? null,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: POST /admin/referral/claim-requests/:id/reject
// ─────────────────────────────────────────────────────────────────────────────
router.post("/admin/referral/claim-requests/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(referralClaimRequestsTable).where(eq(referralClaimRequestsTable.id, id)).limit(1);
  if (!request) { res.status(404).json({ error: "Claim request not found" }); return; }
  if (request.status !== "pending") { res.status(400).json({ error: `Request is already ${request.status}` }); return; }

  const [updated] = await db
    .update(referralClaimRequestsTable)
    .set({ status: "rejected", processedAt: new Date(), adminNote: req.body?.note ?? "Rejected by admin" })
    .where(eq(referralClaimRequestsTable.id, id))
    .returning();

  res.json({
    id: updated!.id, walletAddress: updated!.walletAddress, amountEth: updated!.amountEth,
    claimChainId: updated!.claimChainId, status: updated!.status,
    adminNote: updated!.adminNote ?? null, txHash: updated!.txHash ?? null,
    createdAt: updated!.createdAt.toISOString(),
    processedAt: updated!.processedAt?.toISOString() ?? null,
  });
});

export default router;
