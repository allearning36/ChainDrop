import { Router, type IRouter } from "express";
import fs from "fs";
import crypto from "crypto";
import { eq, desc, count, gte, and } from "drizzle-orm";
import { encryptPrivateKey, resolveChainWalletAddress } from "../lib/encryption";
import { ethers } from "ethers";
import { db, chainsTable, claimsTable, bannersTable, announcementsTable, settingsTable, paymentNetworksTable, abuseLogsTable, masterChainsTable, masterChainTokensTable, exchangePairsTable, liveErrorLogsTable } from "@workspace/db";
import {
  referralsTable,
  referralCommissionsTable,
  referralClaimRequestsTable,
  referralBalanceAdjustmentsTable,
} from "@workspace/db/schema";
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
import { signAdminToken, requireAdmin, checkLoginRateLimit, recordFailedLogin, recordSuccessfulLogin, clearAllRateLimits } from "../lib/adminAuth";
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

  const enteredTrimmed = parsed.data.password.trim();
  const envPassword = (process.env.ADMIN_PASSWORD ?? "").trim();

  let valid: boolean;

  if (envPassword) {
    // Railway env var is set → it is the ONLY valid password; DB hash is ignored entirely.
    const envBuf = Buffer.from(envPassword);
    const enteredBuf = Buffer.from(enteredTrimmed);
    valid = enteredBuf.length === envBuf.length && crypto.timingSafeEqual(enteredBuf, envBuf);
  } else {
    // No Railway env var → fall back to DB-stored hash (set via change-password).
    const storedHash = await getStoredPasswordHash();
    if (!storedHash) {
      res.status(500).json({ error: "Admin password not configured" });
      return;
    }
    valid = verifyPassword(enteredTrimmed, storedHash);
  }

  if (!valid) {
    recordFailedLogin(req);
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  recordSuccessfulLogin(req);
  res.json({ token: signAdminToken() });
});

// Emergency rate-limit reset — requires SESSION_SECRET as Bearer token
router.post("/admin/clear-lockout", (req, res): void => {
  const auth = req.headers.authorization;
  const secret = process.env.SESSION_SECRET;
  if (!secret || !auth || auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  clearAllRateLimits();
  res.json({ ok: true, message: "All rate-limit records cleared" });
});

// Emergency password reset — requires SESSION_SECRET as Bearer token
// Body: { newPassword: string }
router.post("/admin/emergency-reset-password", async (req, res): Promise<void> => {
  const auth = req.headers.authorization;
  const secret = process.env.SESSION_SECRET;
  if (!secret || !auth || auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { newPassword } = req.body as { newPassword?: string };
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "newPassword must be at least 6 characters" });
    return;
  }
  const { hashPassword } = await import("./adminTools");
  const hash = hashPassword(newPassword.trim());
  await db
    .insert(settingsTable)
    .values({ key: "adminPasswordHash", value: hash })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: hash } });
  clearAllRateLimits();
  res.json({ ok: true, message: "Password reset successfully. Rate limits also cleared." });
});

// Password debug — requires SESSION_SECRET, returns length info only (no value)
router.get("/admin/debug-password", (req, res): void => {
  const auth = req.headers.authorization;
  const secret = process.env.SESSION_SECRET;
  if (!secret || !auth || auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const pw = process.env.ADMIN_PASSWORD ?? "";
  res.json({
    envPasswordLength: pw.length,
    envPasswordTrimmedLength: pw.trim().length,
    hasLeadingSpace: pw !== pw.trimStart(),
    hasTrailingSpace: pw !== pw.trimEnd(),
  });
});

// Image upload (auth required) — converts to base64 data URL so logos survive Railway redeploys.
// The file is validated by multer (type + size), read into memory as base64, then the temp file
// is deleted. The data URL is stored directly in the DB (logoUrl column).
router.post("/admin/upload", requireAdmin, upload.single("file"), (req, res): void => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  try {
    // Memory storage (R2 active) → buffer; disk storage → read from path
    const data: Buffer = req.file.buffer ?? fs.readFileSync(req.file.path);
    const b64 = data.toString("base64");
    const mime = req.file.mimetype || "image/png";
    const dataUrl = `data:${mime};base64,${b64}`;
    // Remove temp file if it was written to disk
    if (req.file.path) { try { fs.unlinkSync(req.file.path); } catch { /* ignore */ } }
    res.json({ url: dataUrl });
  } catch (err) {
    res.status(500).json({ error: "Failed to process uploaded image" });
  }
});

// Direct RPC health check — accepts URLs in body, no saved chain needed
router.post("/admin/rpc-health-check", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as { urls?: unknown };
  if (!Array.isArray(body.urls) || body.urls.length === 0) {
    res.status(400).json({ error: "urls array required" });
    return;
  }
  const urls = (body.urls as unknown[]).filter((u): u is string => typeof u === "string" && u.trim().length > 0);
  if (urls.length === 0) { res.json([]); return; }
  const results = await Promise.all(urls.map((url) => checkRpcHealth(url)));
  res.json(results);
});

// ── GET /api/admin/live-history ─────────────────────────────────────────────
// Returns last 7 days of claim successes + errors + blocked abuse events.
// Errors are persisted to DB so admin can review them even days later.
router.get("/admin/live-history", requireAdmin, async (_req, res): Promise<void> => {
  const since7d  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
  const since72h = new Date(Date.now() - 72 * 60 * 60 * 1000);

  const [claims, abuseLogs, errorLogs] = await Promise.all([
    db
      .select({
        id:        claimsTable.id,
        chainId:   claimsTable.chainId,
        chainName: chainsTable.name,
        symbol:    chainsTable.symbol,
        address:   claimsTable.address,
        txHash:    claimsTable.txHash,
        amount:    claimsTable.amount,
        ip:        claimsTable.ip,
        ts:        claimsTable.claimedAt,
      })
      .from(claimsTable)
      .leftJoin(chainsTable, eq(claimsTable.chainId, chainsTable.id))
      .where(gte(claimsTable.claimedAt, since72h))
      .orderBy(desc(claimsTable.claimedAt))
      .limit(200),

    db
      .select()
      .from(abuseLogsTable)
      .where(and(gte(abuseLogsTable.createdAt, since72h), eq(abuseLogsTable.action, "blocked")))
      .orderBy(desc(abuseLogsTable.createdAt))
      .limit(100),

    db
      .select()
      .from(liveErrorLogsTable)
      .where(gte(liveErrorLogsTable.ts, since7d))
      .orderBy(desc(liveErrorLogsTable.ts))
      .limit(300),
  ]);

  const events = [
    ...claims.map(c => ({
      id:        `hist_claim_${c.id}`,
      type:      "claim_success" as const,
      ts:        c.ts.toISOString(),
      chainId:   c.chainId,
      chainName: c.chainName ?? undefined,
      symbol:    c.symbol ?? undefined,
      address:   c.address,
      txHash:    c.txHash,
      amount:    c.amount,
      ip:        c.ip ?? undefined,
      historical: true,
    })),
    ...abuseLogs.map(l => ({
      id:        `hist_abuse_${l.id}`,
      type:      "claim_error" as const,
      ts:        l.createdAt.toISOString(),
      chainId:   l.chainId ?? undefined,
      address:   l.address,
      ip:        l.ip,
      error:     (l.flags as string[])?.join(", ") || "blocked",
      rootCause: "ADDRESS_BLOCKED",
      detail:    `Trust: ${l.trustScore} · ${(l.flags as string[])?.join(", ") || ""}`,
      historical: true,
    })),
    ...errorLogs.map(e => ({
      id:        `hist_err_${e.id}`,
      type:      e.type as "claim_error" | "rpc_error" | "server_error",
      ts:        e.ts.toISOString(),
      chainId:   e.chainId  ?? undefined,
      chainName: e.chainName ?? undefined,
      address:   e.address  ?? undefined,
      ip:        e.ip       ?? undefined,
      error:     e.error    ?? undefined,
      rootCause: e.rootCause ?? undefined,
      detail:    e.detail   ?? undefined,
      hint:      e.hint     ?? undefined,
      historical: true,
    })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 400);

  res.json(events);
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

// System wallet info (derived from FAUCET_PRIVATE_KEY env var)
router.get("/admin/system-wallet", requireAdmin, (_req, res): Promise<void> => {
  const sysKey = process.env.FAUCET_PRIVATE_KEY ?? "";
  if (!sysKey) {
    res.json({ configured: false, address: null });
    return Promise.resolve();
  }
  try {
    const pk = sysKey.startsWith("0x") ? sysKey : `0x${sysKey}`;
    const address = new ethers.Wallet(pk).address;
    res.json({ configured: true, address });
  } catch {
    res.json({ configured: true, address: null, error: "Could not derive address (non-EVM key format)" });
  }
  return Promise.resolve();
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
      buyRates: c.buyRates,
      buyLimits: c.buyLimits,
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
      adCooldownSeconds: c.adCooldownSeconds,
      captchaEnabled: c.captchaEnabled,
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

  // Extract buyRates before Zod validation (not in OpenAPI schema — handled separately)
  let buyRatesForDb: string = "{}";
  if (body.buyRates !== undefined) {
    buyRatesForDb = typeof body.buyRates === "string" ? body.buyRates : JSON.stringify(body.buyRates || {});
    delete body.buyRates;
  }
  let buyLimitsForDb: string = "{}";
  if (body.buyLimits !== undefined) {
    buyLimitsForDb = typeof body.buyLimits === "string" ? body.buyLimits : JSON.stringify(body.buyLimits || {});
    delete body.buyLimits;
  }

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

  const insertData: Record<string, unknown> = { ...parsed.data, rpcUrls: rpcUrlsForDb, buyRates: buyRatesForDb, buyLimits: buyLimitsForDb };
  const rawPk = (insertData.privateKey as string | undefined)?.trim();
  if (rawPk) {
    // Auto-derive wallet address from private key if not supplied (EVM only)
    if (!insertData.walletAddress) {
      try {
        const pk = rawPk.startsWith("0x") ? rawPk : `0x${rawPk}`;
        insertData.walletAddress = new ethers.Wallet(pk).address;
      } catch { /* non-EVM key format — admin must supply address manually */ }
    }
    insertData.privateKey = encryptPrivateKey(rawPk);
  } else {
    insertData.privateKey = null;
  }
  if (!(insertData.walletAddress as string | undefined)?.trim()) insertData.walletAddress = null;
  const [chain] = await db.insert(chainsTable).values(insertData as any).returning();

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
    buyRates: chain.buyRates,
    buyLimits: chain.buyLimits,
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
    adCooldownSeconds: chain.adCooldownSeconds,
    captchaEnabled: chain.captchaEnabled,
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

  // Extract buyRates / buyLimits before Zod validation (not in OpenAPI schema — handled separately)
  let buyRatesForDbPatch: string | undefined;
  if (body.buyRates !== undefined) {
    buyRatesForDbPatch = typeof body.buyRates === "string" ? body.buyRates : JSON.stringify(body.buyRates || {});
    delete body.buyRates;
  }
  let buyLimitsForDbPatch: string | undefined;
  if (body.buyLimits !== undefined) {
    buyLimitsForDbPatch = typeof body.buyLimits === "string" ? body.buyLimits : JSON.stringify(body.buyLimits || {});
    delete body.buyLimits;
  }

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
  if (buyRatesForDbPatch !== undefined) updateData.buyRates = buyRatesForDbPatch;
  if (buyLimitsForDbPatch !== undefined) updateData.buyLimits = buyLimitsForDbPatch;
  const rawUpdatePk = (updateData.privateKey as string | undefined)?.trim();
  if (rawUpdatePk) {
    // Auto-derive wallet address from private key if not supplied (EVM only)
    if (!updateData.walletAddress) {
      try {
        const pk = rawUpdatePk.startsWith("0x") ? rawUpdatePk : `0x${rawUpdatePk}`;
        updateData.walletAddress = new ethers.Wallet(pk).address;
      } catch { /* non-EVM key — keep whatever walletAddress is provided */ }
    }
    updateData.privateKey = encryptPrivateKey(rawUpdatePk);
  } else if ("privateKey" in updateData) {
    updateData.privateKey = null;
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
    buyRates: chain.buyRates,
    buyLimits: chain.buyLimits,
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
    adCooldownSeconds: chain.adCooldownSeconds,
    captchaEnabled: chain.captchaEnabled,
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
      imageUrl: a.imageUrl ?? null,
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
    imageUrl: item.imageUrl ?? null,
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
    imageUrl: item.imageUrl ?? null,
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

// ─── Payment Networks ────────────────────────────────────────────────────────

router.get("/admin/payment-networks", async (_req, res): Promise<void> => {
  const networks = await db.select().from(paymentNetworksTable).orderBy(paymentNetworksTable.id);
  res.json(networks);
});

router.post("/admin/payment-networks", async (req, res): Promise<void> => {
  const { networkId, name, symbol, chainId, rpcUrl, rpcUrls, blockExplorerUrl, isToken, contractAddress, tokenDecimals, logoUrl, isEnabled } = req.body as any;
  if (!networkId || !name || !chainId || !rpcUrl) {
    res.status(400).json({ error: "networkId, name, chainId, and rpcUrl are required" });
    return;
  }
  if (!/^[a-z0-9_]+$/.test(networkId)) {
    res.status(400).json({ error: "networkId must be lowercase alphanumeric with underscores" });
    return;
  }
  const rpcUrlsJson = Array.isArray(rpcUrls) ? JSON.stringify(rpcUrls) : "[]";
  try {
    const [network] = await db.insert(paymentNetworksTable).values({
      networkId,
      name,
      symbol: symbol || "ETH",
      chainId: Number(chainId),
      rpcUrl,
      rpcUrls: rpcUrlsJson,
      blockExplorerUrl: blockExplorerUrl || null,
      isToken: Boolean(isToken),
      contractAddress: isToken ? (contractAddress || null) : null,
      tokenDecimals: tokenDecimals ? Number(tokenDecimals) : 18,
      logoUrl: logoUrl || null,
      isEnabled: isEnabled ?? true,
    }).returning();
    res.status(201).json(network);
  } catch (err: any) {
    const pgCode = err?.code ?? err?.cause?.code ?? (err?.message?.includes("23505") ? "23505" : undefined);
    req.log.error({ err: err?.message ?? String(err) }, "payment-network create error");
    if (pgCode === "23505") {
      res.status(409).json({ error: `Network ID "${networkId}" already exists. Choose a different Network ID.` });
    } else {
      res.status(500).json({ error: `Failed to create payment network: ${err?.message ?? "unknown error"}` });
    }
  }
});

router.patch("/admin/payment-networks/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, symbol, chainId, rpcUrl, rpcUrls, blockExplorerUrl, isToken, contractAddress, tokenDecimals, logoUrl, isEnabled } = req.body as any;
  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (symbol !== undefined) updates.symbol = symbol;
  if (chainId !== undefined) updates.chainId = Number(chainId);
  if (rpcUrl !== undefined) updates.rpcUrl = rpcUrl;
  if (rpcUrls !== undefined) updates.rpcUrls = Array.isArray(rpcUrls) ? JSON.stringify(rpcUrls) : "[]";
  if (blockExplorerUrl !== undefined) updates.blockExplorerUrl = blockExplorerUrl || null;
  if (isToken !== undefined) updates.isToken = Boolean(isToken);
  if (contractAddress !== undefined) updates.contractAddress = contractAddress || null;
  if (tokenDecimals !== undefined) updates.tokenDecimals = Number(tokenDecimals);
  if (logoUrl !== undefined) updates.logoUrl = logoUrl || null;
  if (isEnabled !== undefined) updates.isEnabled = Boolean(isEnabled);
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
  const [network] = await db.update(paymentNetworksTable).set(updates).where(eq(paymentNetworksTable.id, id)).returning();
  if (!network) { res.status(404).json({ error: "Not found" }); return; }
  res.json(network);
});

router.delete("/admin/payment-networks/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(paymentNetworksTable).where(eq(paymentNetworksTable.id, id));
  res.sendStatus(204);
});

router.get("/admin/payment-networks/:id/rpc-health", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [network] = await db.select().from(paymentNetworksTable).where(eq(paymentNetworksTable.id, id));
  if (!network) { res.status(404).json({ error: "Not found" }); return; }
  let extras: string[] = [];
  try { extras = JSON.parse(network.rpcUrls || "[]"); } catch { extras = []; }
  const urls = [network.rpcUrl, ...extras.filter((u: string) => u && u !== network.rpcUrl)];
  const results = await Promise.all(urls.map((url) => checkRpcHealth(url)));
  res.json(results);
});

// ── BACKUP: GET /admin/backup ─────────────────────────────────────────────────
router.get("/admin/backup", requireAdmin, async (_req, res): Promise<void> => {
  const [
    chains, claims, banners, announcements, settings,
    referrals, commissions, claimRequests, adjustments,
  ] = await Promise.all([
    db.select().from(chainsTable),
    db.select().from(claimsTable),
    db.select().from(bannersTable),
    db.select().from(announcementsTable),
    db.select().from(settingsTable),
    db.select().from(referralsTable),
    db.select().from(referralCommissionsTable),
    db.select().from(referralClaimRequestsTable),
    db.select().from(referralBalanceAdjustmentsTable),
  ]);

  const backup = {
    exportedAt: new Date().toISOString(),
    version: 1,
    tables: {
      chains: chains.length,
      claims: claims.length,
      referrals: referrals.length,
      referralCommissions: commissions.length,
    },
    data: {
      chains,
      claims,
      banners,
      announcements,
      settings,
      referrals,
      referralCommissions: commissions,
      referralClaimRequests: claimRequests,
      referralBalanceAdjustments: adjustments,
    },
  };

  const filename = `chaindrop-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.json(backup);
});

// ── RESTORE: POST /admin/restore ─────────────────────────────────────────────
router.post("/admin/restore", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  if (!body?.data || typeof body.data !== "object") {
    res.status(400).json({ error: "Invalid backup file. Expected { data: { ... } }" });
    return;
  }

  const data = body.data as Record<string, unknown[]>;
  const summary: Record<string, number> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function upsert(table: any, idCol: any, rows: unknown[], key: string) {
    if (!Array.isArray(rows) || rows.length === 0) { summary[key] = 0; return; }
    let ok = 0;
    for (const row of rows) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.insert(table).values(row as any).onConflictDoUpdate({ target: idCol, set: row as any });
        ok++;
      } catch { /* skip bad rows */ }
    }
    summary[key] = ok;
  }

  await upsert(chainsTable,                    chainsTable.id,                    data.chains ?? [],                    "chains");
  await upsert(claimsTable,                    claimsTable.id,                    data.claims ?? [],                    "claims");
  await upsert(bannersTable,                   bannersTable.id,                   data.banners ?? [],                   "banners");
  await upsert(announcementsTable,             announcementsTable.id,             data.announcements ?? [],             "announcements");
  await upsert(referralsTable,                 referralsTable.id,                 data.referrals ?? [],                 "referrals");
  await upsert(referralCommissionsTable,       referralCommissionsTable.id,       data.referralCommissions ?? [],       "referralCommissions");
  await upsert(referralClaimRequestsTable,     referralClaimRequestsTable.id,     data.referralClaimRequests ?? [],     "referralClaimRequests");
  await upsert(referralBalanceAdjustmentsTable,referralBalanceAdjustmentsTable.id,data.referralBalanceAdjustments ?? [],"referralBalanceAdjustments");

  // Settings: skip adminPasswordHash to preserve current login password
  const settingsRows = (data.settings ?? []) as Array<{ key: string; value: string }>;
  let settingsOk = 0;
  for (const row of settingsRows) {
    if (!row.key || row.key === "adminPasswordHash") continue;
    try {
      await db.insert(settingsTable).values({ key: row.key, value: row.value })
        .onConflictDoUpdate({ target: settingsTable.key, set: { value: row.value } });
      settingsOk++;
    } catch { /* skip */ }
  }
  summary["settings"] = settingsOk;

  res.json({ success: true, restored: summary });
});

// ─── Master Chain Library ─────────────────────────────────────────────────────

function parseMasterChainRpcs(raw: string): string[] {
  try { return JSON.parse(raw); } catch { return []; }
}

router.get("/admin/master-chains", async (_req, res): Promise<void> => {
  const chains = await db.select().from(masterChainsTable).orderBy(masterChainsTable.name);
  res.json(chains.map(c => ({
    id: c.id,
    name: c.name,
    symbol: c.symbol,
    chainId: c.chainId,
    chainType: c.chainType,
    logoUrl: c.logoUrl,
    rpcUrls: parseMasterChainRpcs(c.rpcUrls),
    explorerUrls: parseMasterChainRpcs(c.explorerUrls),
    isTestnet: c.isTestnet,
    createdAt: c.createdAt.toISOString(),
  })));
});

router.post("/admin/master-chains/populate", async (_req, res): Promise<void> => {
  const existing = await db.select().from(masterChainsTable);
  const existingKeys = new Set(existing.map(c => `${c.name}::${String(c.chainId ?? "")}`));
  let added = 0;

  const faucetChains = await db.select().from(chainsTable);
  for (const c of faucetChains) {
    const key = `${c.name}::${String(c.chainId ?? "")}`;
    if (existingKeys.has(key)) continue;
    const rpcs = parseRpcUrls(c.rpcUrls, c.rpcUrl);
    const explorers = c.explorerUrl ? [c.explorerUrl] : [];
    await db.insert(masterChainsTable).values({
      name: c.name,
      symbol: c.symbol,
      chainId: c.chainId ?? null,
      chainType: c.chainType ?? "evm",
      logoUrl: c.logoUrl ?? null,
      rpcUrls: JSON.stringify(rpcs),
      explorerUrls: JSON.stringify(explorers),
      isTestnet: c.isTestnet ?? true,
    });
    existingKeys.add(key);
    added++;
  }

  const pairs = await db.select().from(exchangePairsTable);
  for (const p of pairs) {
    for (const side of ["from", "to"] as const) {
      const name = side === "from" ? p.fromChainName : p.toChainName;
      const symbol = side === "from" ? p.fromSymbol : p.toSymbol;
      const chainId = side === "from" ? p.fromChainId : p.toChainId;
      const rpcUrl = side === "from" ? p.fromRpcUrl : p.toRpcUrl;
      const rpcUrlsRaw = side === "from" ? p.fromRpcUrls : p.toRpcUrls;
      const explorerUrl = side === "from" ? p.fromExplorerUrl : p.toExplorerUrl;
      const logoUrl = side === "from" ? p.fromLogoUrl : p.toLogoUrl;
      const key = `${name}::${String(chainId)}`;
      if (existingKeys.has(key)) continue;
      const rpcs = parseRpcUrls(rpcUrlsRaw ?? null, rpcUrl);
      await db.insert(masterChainsTable).values({
        name,
        symbol,
        chainId,
        chainType: "evm",
        logoUrl: logoUrl ?? null,
        rpcUrls: JSON.stringify(rpcs),
        explorerUrls: JSON.stringify(explorerUrl ? [explorerUrl] : []),
        isTestnet: false,
      });
      existingKeys.add(key);
      added++;
    }
  }

  res.json({ ok: true, added });
});

router.post("/admin/master-chains", async (req, res): Promise<void> => {
  const { name, symbol, chainId, chainType, logoUrl, rpcUrls, explorerUrls, isTestnet } = req.body as Record<string, unknown>;
  if (!name || !symbol) { res.status(400).json({ error: "name and symbol are required" }); return; }
  const [chain] = await db.insert(masterChainsTable).values({
    name: String(name),
    symbol: String(symbol),
    chainId: chainId != null ? Number(chainId) : null,
    chainType: chainType ? String(chainType) : "evm",
    logoUrl: logoUrl ? String(logoUrl) : null,
    rpcUrls: JSON.stringify(Array.isArray(rpcUrls) ? (rpcUrls as string[]).filter(Boolean) : []),
    explorerUrls: JSON.stringify(Array.isArray(explorerUrls) ? (explorerUrls as string[]).filter(Boolean) : []),
    isTestnet: Boolean(isTestnet ?? true),
  }).returning();
  res.status(201).json({
    id: chain.id, name: chain.name, symbol: chain.symbol,
    chainId: chain.chainId, chainType: chain.chainType, logoUrl: chain.logoUrl,
    rpcUrls: parseMasterChainRpcs(chain.rpcUrls),
    explorerUrls: parseMasterChainRpcs(chain.explorerUrls),
    isTestnet: chain.isTestnet, createdAt: chain.createdAt.toISOString(),
  });
});

router.patch("/admin/master-chains/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { name, symbol, chainId, chainType, logoUrl, rpcUrls, explorerUrls, isTestnet } = req.body as Record<string, unknown>;
  const upd: Record<string, unknown> = {};
  if (name !== undefined) upd.name = String(name);
  if (symbol !== undefined) upd.symbol = String(symbol);
  if (chainId !== undefined) upd.chainId = chainId != null && chainId !== "" ? Number(chainId) : null;
  if (chainType !== undefined) upd.chainType = String(chainType);
  if (logoUrl !== undefined) upd.logoUrl = logoUrl ? String(logoUrl) : null;
  if (rpcUrls !== undefined) upd.rpcUrls = JSON.stringify(Array.isArray(rpcUrls) ? (rpcUrls as string[]).filter(Boolean) : []);
  if (explorerUrls !== undefined) upd.explorerUrls = JSON.stringify(Array.isArray(explorerUrls) ? (explorerUrls as string[]).filter(Boolean) : []);
  if (isTestnet !== undefined) upd.isTestnet = Boolean(isTestnet);
  const [chain] = await db.update(masterChainsTable).set(upd as any).where(eq(masterChainsTable.id, id)).returning();
  if (!chain) { res.status(404).json({ error: "Not found" }); return; }
  res.json({
    id: chain.id, name: chain.name, symbol: chain.symbol,
    chainId: chain.chainId, chainType: chain.chainType, logoUrl: chain.logoUrl,
    rpcUrls: parseMasterChainRpcs(chain.rpcUrls),
    explorerUrls: parseMasterChainRpcs(chain.explorerUrls),
    isTestnet: chain.isTestnet, createdAt: chain.createdAt.toISOString(),
  });
});

router.delete("/admin/master-chains/:id", async (req, res): Promise<void> => {
  await db.delete(masterChainsTable).where(eq(masterChainsTable.id, Number(req.params.id)));
  res.json({ ok: true });
});

router.get("/admin/master-chains/:id/rpc-health", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) { res.status(400).json({ error: "Invalid id" }); return; }
  const [chain] = await db.select().from(masterChainsTable).where(eq(masterChainsTable.id, id));
  if (!chain) { res.status(404).json({ error: "Not found" }); return; }
  const urls: string[] = Array.isArray(chain.rpcUrls) ? chain.rpcUrls as string[] : [];
  if (urls.length === 0) { res.json([]); return; }
  const results = await Promise.all(urls.map((url) => checkRpcHealth(url)));
  res.json(results);
});

// ── Chain Library: Token Management ──────────────────────────────────────────

router.get("/admin/master-chains/:id/tokens", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) { res.status(400).json({ error: "Invalid id" }); return; }
  const tokens = await db.select().from(masterChainTokensTable)
    .where(eq(masterChainTokensTable.masterChainId, id))
    .orderBy(masterChainTokensTable.id);
  res.json(tokens);
});

router.post("/admin/master-chains/:id/tokens", async (req, res): Promise<void> => {
  const masterChainId = Number(req.params.id);
  if (!Number.isInteger(masterChainId) || masterChainId < 1) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, symbol, contractAddress, decimals, logoUrl } = req.body as Record<string, unknown>;
  if (!name || !symbol || !contractAddress) {
    res.status(400).json({ error: "name, symbol, and contractAddress are required" }); return;
  }
  const [token] = await db.insert(masterChainTokensTable).values({
    masterChainId,
    name: String(name),
    symbol: String(symbol).toUpperCase(),
    contractAddress: String(contractAddress),
    decimals: decimals != null ? Number(decimals) : 18,
    logoUrl: logoUrl ? String(logoUrl) : null,
  }).returning();
  res.status(201).json(token);
});

router.patch("/admin/master-chains/:id/tokens/:tokenId", async (req, res): Promise<void> => {
  const masterChainId = Number(req.params.id);
  const tokenId = Number(req.params.tokenId);
  if (!Number.isInteger(tokenId) || tokenId < 1) { res.status(400).json({ error: "Invalid tokenId" }); return; }
  const { name, symbol, contractAddress, decimals, logoUrl } = req.body as Record<string, unknown>;
  const upd: Record<string, unknown> = {};
  if (name !== undefined) upd.name = String(name);
  if (symbol !== undefined) upd.symbol = String(symbol).toUpperCase();
  if (contractAddress !== undefined) upd.contractAddress = String(contractAddress);
  if (decimals !== undefined) upd.decimals = Number(decimals);
  if (logoUrl !== undefined) upd.logoUrl = logoUrl ? String(logoUrl) : null;
  const [token] = await db.update(masterChainTokensTable).set(upd as any)
    .where(and(eq(masterChainTokensTable.id, tokenId), eq(masterChainTokensTable.masterChainId, masterChainId)))
    .returning();
  if (!token) { res.status(404).json({ error: "Not found" }); return; }
  res.json(token);
});

router.delete("/admin/master-chains/:id/tokens/:tokenId", async (req, res): Promise<void> => {
  const masterChainId = Number(req.params.id);
  const tokenId = Number(req.params.tokenId);
  if (!Number.isInteger(tokenId) || tokenId < 1) { res.status(400).json({ error: "Invalid tokenId" }); return; }
  await db.delete(masterChainTokensTable)
    .where(and(eq(masterChainTokensTable.id, tokenId), eq(masterChainTokensTable.masterChainId, masterChainId)));
  res.json({ ok: true });
});

export default router;
