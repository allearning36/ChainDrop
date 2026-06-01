import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, announcementsTable } from "@workspace/db";
import { getCached, setCached } from "../lib/cache";

const CACHE_KEY = "announcements:public";
const CACHE_TTL = 2 * 60_000; // 2 minutes

const router: IRouter = Router();

router.get("/announcements", async (_req, res): Promise<void> => {
  const cached = getCached<object[]>(CACHE_KEY);
  if (cached) { res.json(cached); return; }

  const items = await db
    .select()
    .from(announcementsTable)
    .where(eq(announcementsTable.isActive, true))
    .orderBy(desc(announcementsTable.createdAt));

  const result = items.map((a) => ({
    id: a.id,
    title: a.title,
    content: a.content,
    imageUrl: a.imageUrl ?? null,
    isActive: a.isActive,
    createdAt: a.createdAt.toISOString(),
  }));

  setCached(CACHE_KEY, result, CACHE_TTL);
  res.json(result);
});

export default router;
