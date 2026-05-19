import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, bannersTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/banners", async (_req, res): Promise<void> => {
  const banners = await db
    .select()
    .from(bannersTable)
    .where(eq(bannersTable.isActive, true))
    .orderBy(asc(bannersTable.sortOrder), asc(bannersTable.id));

  res.json(
    banners.map((b) => ({
      id: b.id,
      imageUrl: b.imageUrl,
      linkUrl: b.linkUrl,
      altText: b.altText,
      isActive: b.isActive,
      sortOrder: b.sortOrder,
      createdAt: b.createdAt.toISOString(),
    }))
  );
});

export default router;
