import { Router, type IRouter } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db, chainAdsTable } from "@workspace/db";
import { requireAdmin } from "../lib/adminAuth";

const router: IRouter = Router();

// ── GET /admin/chains/:chainId/ads ───────────────────────────────────────────
router.get("/admin/chains/:chainId/ads", requireAdmin, async (req, res): Promise<void> => {
  const chainId = parseInt(req.params.chainId as string, 10);
  if (!chainId) { res.status(400).json({ error: "Invalid chainId" }); return; }

  const ads = await db
    .select()
    .from(chainAdsTable)
    .where(eq(chainAdsTable.chainId, chainId))
    .orderBy(asc(chainAdsTable.priority), asc(chainAdsTable.id));

  res.json(ads);
});

// ── POST /admin/chains/:chainId/ads ──────────────────────────────────────────
router.post("/admin/chains/:chainId/ads", requireAdmin, async (req, res): Promise<void> => {
  const chainId = parseInt(req.params.chainId as string, 10);
  if (!chainId) { res.status(400).json({ error: "Invalid chainId" }); return; }

  const { label, adUrl, adType, priority, isEnabled } = req.body as {
    label: string; adUrl: string; adType: string;
    priority?: number; isEnabled?: boolean;
  };
  if (!label || !adUrl) { res.status(400).json({ error: "label and adUrl required" }); return; }

  const [created] = await db
    .insert(chainAdsTable)
    .values({
      chainId,
      label,
      adUrl,
      adType: adType ?? "vast",
      priority: priority ?? 0,
      isEnabled: isEnabled !== false,
    })
    .returning();

  res.status(201).json(created);
});

// ── PATCH /admin/chains/:chainId/ads/:adId ───────────────────────────────────
router.patch("/admin/chains/:chainId/ads/:adId", requireAdmin, async (req, res): Promise<void> => {
  const chainId = parseInt(req.params.chainId as string, 10);
  const adId    = parseInt(req.params.adId    as string, 10);
  if (!chainId || !adId) { res.status(400).json({ error: "Invalid id" }); return; }

  const { label, adUrl, adType, priority, isEnabled } = req.body as {
    label?: string; adUrl?: string; adType?: string;
    priority?: number; isEnabled?: boolean;
  };

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (label     !== undefined) patch.label     = label;
  if (adUrl     !== undefined) patch.adUrl     = adUrl;
  if (adType    !== undefined) patch.adType    = adType;
  if (priority  !== undefined) patch.priority  = priority;
  if (isEnabled !== undefined) patch.isEnabled = isEnabled;

  const [updated] = await db
    .update(chainAdsTable)
    .set(patch)
    .where(and(eq(chainAdsTable.id, adId), eq(chainAdsTable.chainId, chainId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// ── DELETE /admin/chains/:chainId/ads/:adId ──────────────────────────────────
router.delete("/admin/chains/:chainId/ads/:adId", requireAdmin, async (req, res): Promise<void> => {
  const chainId = parseInt(req.params.chainId as string, 10);
  const adId    = parseInt(req.params.adId    as string, 10);
  if (!chainId || !adId) { res.status(400).json({ error: "Invalid id" }); return; }

  await db
    .delete(chainAdsTable)
    .where(and(eq(chainAdsTable.id, adId), eq(chainAdsTable.chainId, chainId)));

  res.status(204).end();
});

// ── GET /chains/:chainId/ads (public — enabled only, ordered by priority) ────
router.get("/chains/:chainId/ads", async (req, res): Promise<void> => {
  const chainId = parseInt(req.params.chainId as string, 10);
  if (!chainId) { res.status(400).json({ error: "Invalid chainId" }); return; }

  const ads = await db
    .select({
      id:       chainAdsTable.id,
      adUrl:    chainAdsTable.adUrl,
      adType:   chainAdsTable.adType,
      priority: chainAdsTable.priority,
    })
    .from(chainAdsTable)
    .where(and(eq(chainAdsTable.chainId, chainId), eq(chainAdsTable.isEnabled, true)))
    .orderBy(asc(chainAdsTable.priority), asc(chainAdsTable.id));

  res.json(ads);
});

export default router;
