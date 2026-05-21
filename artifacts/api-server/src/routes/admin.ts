import { Router, type IRouter } from "express";
import crypto from "crypto";
import { eq, desc, count } from "drizzle-orm";
import { encryptPrivateKey } from "../lib/encryption";
import { db, chainsTable, claimsTable, bannersTable, announcementsTable, settingsTable } from "@workspace/db";
import { getStoredPasswordHash, verifyPassword } from "./adminTools";
import { upload } from "./upload";
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
import { signAdminToken, requireAdmin, checkLoginRateLimit, recordFailedLogin, recordSuccessfulLogin } from "../lib/adminAuth";
import { parseRpcUrls, checkRpcHealth } from "../lib/rpcFailover";

const router: IRouter = Router();

// Auth
router.post("/admin/auth", async (req, res): Promise<void> => {
  // Rate-limit check — block IPs that have failed too many times
  const blocked = checkLoginRateLimit(req);
  if (blocked) {
    res.status(429).json({ error: blocked });
    return;
  }

  const parsed = AdminAuthBody.safeParse(req.body);
  if (!parsed.success) {
    recordFailedLogin(req);
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    res.status(500).json({ error: "Admin password not configured" });
    return;
  }

  // Check DB-stored hash first (set via change-password), fall back to env var
  const storedHash = await getStoredPasswordHash();
  let valid: boolean;
  if (storedHash) {
    valid = verifyPassword(parsed.data.password, storedHash);
  } else {
    // Timing-safe comparison even for the plaintext env-var fallback
    const a = Buffer.from(parsed.data.password);
    const b = Buffer.from(adminPassword);
    valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  if (!valid) {
    recordFailedLogin(req);
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  recordSuccessfulLogin(req);
  res.json({ token: signAdminToken() });
});

// Image upload (auth required) — delegates to the shared upload middleware from upload.ts
router.post("/admin/upload", requireAdmin, upload.single("file"), (req, res): void => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  // Build URL from REPLIT_DOMAINS env var — never trust client-supplied host headers
  const domains = (process.env.REPLIT_DOMAINS ?? "").split(",").map(d => d.trim()).filter(Boolean);
  const url = domains.length > 0
    ? `https://${domains[0]}/api/uploads/${req.file.filename}`
    : `/api/uploads/${req.file.filename}`;
  res.json({ url });
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
      chainId: c.chainId,
      chainType: c.chainType,
      logoUrl: c.logoUrl,
      rpcUrl: c.rpcUrl,
      rpcUrls: parseRpcUrls(c.rpcUrls, c.rpcUrl),
      walletAddress: c.walletAddress,
      claimAmount: c.claimAmount,
      cooldownSeconds: c.cooldownSeconds,
      isTestnet: c.isTestnet,
      isEnabled: c.isEnabled,
      isPinned: c.isPinned,
      availableStatus: c.availableStatus,
      buyEnabled: c.buyEnabled,
      buyUrl: c.buyUrl,
      buyRate: c.buyRate,
      buyMinAmount: c.buyMinAmount,
      buyMaxAmount: c.buyMaxAmount ?? null,
      buyCurrencies: c.buyCurrencies,
      receiveAddress: c.receiveAddress,
      explorerUrl: c.explorerUrl,
      tokenPrice: c.tokenPrice,
      coingeckoId: c.coingeckoId,
      gasPriceGwei: c.gasPriceGwei,
      adClaimEnabled: c.adClaimEnabled,
      adClaimAmount: c.adClaimAmount ?? null,
      adDurationSeconds: c.adDurationSeconds,
      adNetworkCode: c.adNetworkCode ?? null,
      sortOrder: c.sortOrder,
      createdAt: c.createdAt.toISOString(),
    }))
  );
});

/** Strip null and empty-string values so optional Zod fields don't reject them */
function stripNulls(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && v !== "")
  );
}

router.post("/admin/chains", async (req, res): Promise<void> => {
  const body = stripNulls(req.body) as Record<string, unknown>;

  // Extract and serialize rpcUrls before Zod validation (DB column is text, not array)
  let rpcUrlsForDb: string = '[]';
  if (Array.isArray(body.rpcUrls) && body.rpcUrls.length > 0) {
    body.rpcUrl = body.rpcUrls[0];
    rpcUrlsForDb = JSON.stringify(body.rpcUrls);
  } else if (typeof body.rpcUrl === "string") {
    rpcUrlsForDb = JSON.stringify([body.rpcUrl]);
  }
  delete body.rpcUrls;

  const parsed = CreateChainBody.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const insertData = { ...parsed.data, rpcUrls: rpcUrlsForDb };
  if (insertData.privateKey) insertData.privateKey = encryptPrivateKey(insertData.privateKey);
  const [chain] = await db.insert(chainsTable).values(insertData).returning();

  res.status(201).json({
    id: chain.id,
    name: chain.name,
    symbol: chain.symbol,
    chainId: chain.chainId,
    chainType: chain.chainType,
    logoUrl: chain.logoUrl,
    rpcUrl: chain.rpcUrl,
    rpcUrls: parseRpcUrls(chain.rpcUrls, chain.rpcUrl),
    walletAddress: chain.walletAddress,
    claimAmount: chain.claimAmount,
    cooldownSeconds: chain.cooldownSeconds,
    isTestnet: chain.isTestnet,
    isEnabled: chain.isEnabled,
    isPinned: chain.isPinned,
    availableStatus: chain.availableStatus,
    buyEnabled: chain.buyEnabled,
    buyUrl: chain.buyUrl,
    buyRate: chain.buyRate,
    buyMinAmount: chain.buyMinAmount,
    buyMaxAmount: chain.buyMaxAmount ?? null,
    buyCurrencies: chain.buyCurrencies,
    receiveAddress: chain.receiveAddress,
    explorerUrl: chain.explorerUrl,
    tokenPrice: chain.tokenPrice,
    coingeckoId: chain.coingeckoId,
    adClaimEnabled: chain.adClaimEnabled,
    adClaimAmount: chain.adClaimAmount ?? null,
    adDurationSeconds: chain.adDurationSeconds,
    adNetworkCode: chain.adNetworkCode ?? null,
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

  const body = stripNulls(req.body) as Record<string, unknown>;

  // Extract and serialize rpcUrls before Zod validation (DB column is text, not array)
  let rpcUrlsForDb: string | undefined;
  if (Array.isArray(body.rpcUrls) && body.rpcUrls.length > 0) {
    body.rpcUrl = body.rpcUrls[0];
    rpcUrlsForDb = JSON.stringify(body.rpcUrls);
  } else if (typeof body.rpcUrl === "string") {
    rpcUrlsForDb = JSON.stringify([body.rpcUrl]);
  }
  delete body.rpcUrls;

  const parsed = UpdateChainBody.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = rpcUrlsForDb !== undefined
    ? { ...parsed.data, rpcUrls: rpcUrlsForDb }
    : { ...parsed.data };
  if (typeof updateData.privateKey === "string" && updateData.privateKey) {
    updateData.privateKey = encryptPrivateKey(updateData.privateKey as string);
  }

  const [chain] = await db
    .update(chainsTable)
    .set(updateData)
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
    chainId: chain.chainId,
    chainType: chain.chainType,
    logoUrl: chain.logoUrl,
    rpcUrl: chain.rpcUrl,
    rpcUrls: parseRpcUrls(chain.rpcUrls, chain.rpcUrl),
    walletAddress: chain.walletAddress,
    claimAmount: chain.claimAmount,
    cooldownSeconds: chain.cooldownSeconds,
    isTestnet: chain.isTestnet,
    isEnabled: chain.isEnabled,
    isPinned: chain.isPinned,
    availableStatus: chain.availableStatus,
    buyEnabled: chain.buyEnabled,
    buyUrl: chain.buyUrl,
    buyRate: chain.buyRate,
    buyMinAmount: chain.buyMinAmount,
    buyMaxAmount: chain.buyMaxAmount ?? null,
    buyCurrencies: chain.buyCurrencies,
    receiveAddress: chain.receiveAddress,
    explorerUrl: chain.explorerUrl,
    tokenPrice: chain.tokenPrice,
    coingeckoId: chain.coingeckoId,
    gasPriceGwei: chain.gasPriceGwei,
    adClaimEnabled: chain.adClaimEnabled,
    adClaimAmount: chain.adClaimAmount ?? null,
    adDurationSeconds: chain.adDurationSeconds,
    adNetworkCode: chain.adNetworkCode ?? null,
    sortOrder: chain.sortOrder,
    createdAt: chain.createdAt.toISOString(),
  });
});

// RPC Health Check
router.get("/admin/chains/:id/rpc-health", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) { res.status(400).json({ error: "Invalid chain id" }); return; }

  const [chain] = await db.select().from(chainsTable).where(eq(chainsTable.id, id));
  if (!chain) { res.status(404).json({ error: "Chain not found" }); return; }

  const urls = parseRpcUrls(chain.rpcUrls, chain.rpcUrl);
  const results = await Promise.all(urls.map((url) => checkRpcHealth(url)));
  res.json(results);
});

router.patch("/admin/chains/:id/pin", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) { res.status(400).json({ error: "Invalid chain id" }); return; }
  const [existing] = await db.select({ isPinned: chainsTable.isPinned }).from(chainsTable).where(eq(chainsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Chain not found" }); return; }
  const [updated] = await db.update(chainsTable).set({ isPinned: !existing.isPinned }).where(eq(chainsTable.id, id)).returning({ isPinned: chainsTable.isPinned });
  res.json({ isPinned: updated!.isPinned });
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
