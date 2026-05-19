import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, announcementsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/announcements", async (_req, res): Promise<void> => {
  const items = await db
    .select()
    .from(announcementsTable)
    .where(eq(announcementsTable.isActive, true))
    .orderBy(desc(announcementsTable.createdAt));

  res.json(
    items.map((a) => ({
      id: a.id,
      title: a.title,
      content: a.content,
      isActive: a.isActive,
      createdAt: a.createdAt.toISOString(),
    }))
  );
});

export default router;
