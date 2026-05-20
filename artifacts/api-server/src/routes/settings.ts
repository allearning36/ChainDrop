import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { requireAdmin } from "../lib/adminAuth";

const router: IRouter = Router();

const DEFAULT_SETTINGS: Record<string, string> = {
  logoUrl: "/logo.svg",
  logoGlow: "medium",
  logoSize: "medium",
};

router.get("/settings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable);
  const map: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.value !== null) map[row.key] = row.value;
  }
  res.json(map);
});

router.patch("/admin/settings", requireAdmin, async (req, res): Promise<void> => {
  const updates = req.body as Record<string, string>;
  if (!updates || typeof updates !== "object") {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  for (const [key, value] of Object.entries(updates)) {
    await db
      .insert(settingsTable)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: String(value) } });
  }

  const rows = await db.select().from(settingsTable);
  const map: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.value !== null) map[row.key] = row.value;
  }
  res.json(map);
});

export default router;
