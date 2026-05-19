import { Router, type IRouter } from "express";
import { eq, desc, count } from "drizzle-orm";
import { db, chainsTable, claimsTable, bannersTable, announcementsTable } from "@workspace/db";
import {
  AdminAuthBody,
  CreateChainBody,
  UpdateChainBody,
  UpdateChainParams,
  DeleteChainParams,
  CreateBannerBody,
  UpdateBannerBody,
  UpdateBannerParams,
  DeleteBannerParams,
  CreateAnnouncementBody,
  UpdateAnnouncementBody,
  UpdateAnnouncementParams,
  DeleteAnnouncementParams,
} from "@workspace/api-zod";
import { signAdminToken, requireAdmin } from "../lib/adminAuth";

const router: IRouter = Router();

// Auth
router.post("/admin/auth", async (req, res): Promise<void> => {
  const parsed = AdminAuthBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    res.status(500).json({ error: "Admin password not configured" });
    return;
  }

  if (parsed.data.password !== adminPassword) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  res.json({ token: signAdminToken() });
});

// All admin routes require auth
router.use("/admin", requireAdmin);

// Stats
router.get("/admin/stats", async (_req, res): Promise<void> => {
  const [{ totalClaims }] = await db.select({ totalClaims: count(claimsTable.id) }).from(claimsTable);
  const allChains = await db.select().from(chainsTable);
  const activeChains = allChains.filter((c) => c.isEnabled).length;

  const recentSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [{ recentClaimsCount }] = await db
    .select({ recentClaimsCount: count(claimsTable.id) })
    .from(claimsTable)
    .where(eq(claimsTable.claimedAt, recentSince));

  res.json({
    totalClaims: Number(totalClaims),
    totalChains: allChains.length,
    activeChains,
    recentClaimsCount: Number(recentClaimsCount),
  });
});

// Chains
router.get("/admin/chains", async (_req, res): Promise<void> => {
  const chains = await db.select().from(chainsTable).orderBy(chainsTable.sortOrder, chainsTable.id);
  res.json(
    chains.map((c) => ({
      id: c.id,
      name: c.name,
      symbol: c.symbol,
      logoUrl: c.logoUrl,
      rpcUrl: c.rpcUrl,
      walletAddress: c.walletAddress,
      claimAmount: c.claimAmount,
      cooldownHours: c.cooldownHours,
      isTestnet: c.isTestnet,
      isEnabled: c.isEnabled,
      availableStatus: c.availableStatus,
      buyEnabled: c.buyEnabled,
      buyUrl: c.buyUrl,
      coingeckoId: c.coingeckoId,
      sortOrder: c.sortOrder,
      createdAt: c.createdAt.toISOString(),
    }))
  );
});

router.post("/admin/chains", async (req, res): Promise<void> => {
  const parsed = CreateChainBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [chain] = await db.insert(chainsTable).values(parsed.data).returning();

  res.status(201).json({
    id: chain.id,
    name: chain.name,
    symbol: chain.symbol,
    logoUrl: chain.logoUrl,
    rpcUrl: chain.rpcUrl,
    walletAddress: chain.walletAddress,
    claimAmount: chain.claimAmount,
    cooldownHours: chain.cooldownHours,
    isTestnet: chain.isTestnet,
    isEnabled: chain.isEnabled,
    availableStatus: chain.availableStatus,
    buyEnabled: chain.buyEnabled,
    buyUrl: chain.buyUrl,
    coingeckoId: chain.coingeckoId,
    sortOrder: chain.sortOrder,
    createdAt: chain.createdAt.toISOString(),
  });
});

router.patch("/admin/chains/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateChainParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateChainBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [chain] = await db
    .update(chainsTable)
    .set(parsed.data)
    .where(eq(chainsTable.id, params.data.id))
    .returning();

  if (!chain) {
    res.status(404).json({ error: "Chain not found" });
    return;
  }

  res.json({
    id: chain.id,
    name: chain.name,
    symbol: chain.symbol,
    logoUrl: chain.logoUrl,
    rpcUrl: chain.rpcUrl,
    walletAddress: chain.walletAddress,
    claimAmount: chain.claimAmount,
    cooldownHours: chain.cooldownHours,
    isTestnet: chain.isTestnet,
    isEnabled: chain.isEnabled,
    availableStatus: chain.availableStatus,
    buyEnabled: chain.buyEnabled,
    buyUrl: chain.buyUrl,
    coingeckoId: chain.coingeckoId,
    sortOrder: chain.sortOrder,
    createdAt: chain.createdAt.toISOString(),
  });
});

router.delete("/admin/chains/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteChainParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(chainsTable).where(eq(chainsTable.id, params.data.id));
  res.sendStatus(204);
});

// Banners
router.get("/admin/banners", async (_req, res): Promise<void> => {
  const banners = await db.select().from(bannersTable).orderBy(bannersTable.sortOrder, bannersTable.id);
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

router.post("/admin/banners", async (req, res): Promise<void> => {
  const parsed = CreateBannerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [banner] = await db.insert(bannersTable).values(parsed.data).returning();
  res.status(201).json({
    id: banner.id,
    imageUrl: banner.imageUrl,
    linkUrl: banner.linkUrl,
    altText: banner.altText,
    isActive: banner.isActive,
    sortOrder: banner.sortOrder,
    createdAt: banner.createdAt.toISOString(),
  });
});

router.patch("/admin/banners/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateBannerParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateBannerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [banner] = await db
    .update(bannersTable)
    .set(parsed.data)
    .where(eq(bannersTable.id, params.data.id))
    .returning();

  if (!banner) {
    res.status(404).json({ error: "Banner not found" });
    return;
  }

  res.json({
    id: banner.id,
    imageUrl: banner.imageUrl,
    linkUrl: banner.linkUrl,
    altText: banner.altText,
    isActive: banner.isActive,
    sortOrder: banner.sortOrder,
    createdAt: banner.createdAt.toISOString(),
  });
});

router.delete("/admin/banners/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteBannerParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(bannersTable).where(eq(bannersTable.id, params.data.id));
  res.sendStatus(204);
});

// Announcements
router.get("/admin/announcements", async (_req, res): Promise<void> => {
  const items = await db.select().from(announcementsTable).orderBy(desc(announcementsTable.createdAt));
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

router.post("/admin/announcements", async (req, res): Promise<void> => {
  const parsed = CreateAnnouncementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db.insert(announcementsTable).values(parsed.data).returning();
  res.status(201).json({
    id: item.id,
    title: item.title,
    content: item.content,
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
  });
});

router.patch("/admin/announcements/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateAnnouncementParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateAnnouncementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .update(announcementsTable)
    .set(parsed.data)
    .where(eq(announcementsTable.id, params.data.id))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Announcement not found" });
    return;
  }

  res.json({
    id: item.id,
    title: item.title,
    content: item.content,
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
  });
});

router.delete("/admin/announcements/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteAnnouncementParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(announcementsTable).where(eq(announcementsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
