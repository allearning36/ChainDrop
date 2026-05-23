import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import { db, nonceTable } from "@workspace/db";
import { eq, and, gt, isNull } from "drizzle-orm";
import { requireAdmin } from "../lib/adminAuth";
import { nonceLimiter, adminAbuseLimiter } from "../lib/rateLimiters";
import { getActiveBans, getRecentAbuseLogs, getSuspiciousLogs, liftBan } from "../lib/antiAbuse";

const router: IRouter = Router();

// ── GET /anti-abuse/nonce/:address ─────────────────────────────────────────
// Generate a signing nonce for wallet signature verification.
router.get("/anti-abuse/nonce/:address", nonceLimiter, async (req, res): Promise<void> => {
  const address = (req.params.address as string).toLowerCase().trim();
  if (!address || !/^0x[a-f0-9]{40}$/.test(address)) {
    res.status(400).json({ error: "Invalid EVM address" });
    return;
  }

  // Invalidate old unused nonces for this address
  try {
    await db
      .update(nonceTable)
      .set({ usedAt: new Date() })
      .where(and(eq(nonceTable.address, address), isNull(nonceTable.usedAt)));
  } catch { /* non-critical */ }

  const nonce = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await db.insert(nonceTable).values({ address, nonce, expiresAt });

  res.json({
    nonce,
    message: `ChainDrop claim verification\nAddress: ${address}\nNonce: ${nonce}`,
    expiresAt: expiresAt.toISOString(),
  });
});

// ── Admin: GET /anti-abuse/bans ─────────────────────────────────────────────
router.get("/anti-abuse/bans", adminAbuseLimiter, requireAdmin, async (_req, res): Promise<void> => {
  const bans = await getActiveBans(200);
  res.json(bans);
});

// ── Admin: DELETE /anti-abuse/bans/:id ─────────────────────────────────────
router.delete("/anti-abuse/bans/:id", adminAbuseLimiter, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await liftBan(id);
  res.json({ ok: true });
});

// ── Admin: GET /anti-abuse/logs ─────────────────────────────────────────────
router.get("/anti-abuse/logs", adminAbuseLimiter, requireAdmin, async (_req, res): Promise<void> => {
  const logs = await getRecentAbuseLogs(200);
  res.json(logs);
});

// ── Admin: GET /anti-abuse/suspicious ──────────────────────────────────────
router.get("/anti-abuse/suspicious", adminAbuseLimiter, requireAdmin, async (_req, res): Promise<void> => {
  const logs = await getSuspiciousLogs(200);
  res.json(logs);
});

export default router;
