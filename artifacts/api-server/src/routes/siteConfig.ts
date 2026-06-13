import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { db, settingsTable, ipBlocksTable } from "@workspace/db";
import { requireAdmin } from "../lib/adminAuth";
import { getCached, setCached, invalidateCache } from "../lib/cache";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
  if (!row?.value) return fallback;
  try { return JSON.parse(row.value) as T; } catch { return fallback; }
}

// Batch: fetch multiple settings keys in one query
async function getSettingsBatch(keysWithDefaults: [string, unknown][]): Promise<Record<string, unknown>> {
  const keys = keysWithDefaults.map(([k]) => k);
  const rows = await db.select({ key: settingsTable.key, value: settingsTable.value })
    .from(settingsTable).where(inArray(settingsTable.key, keys));
  const found = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return Object.fromEntries(keysWithDefaults.map(([k, def]) => {
    const raw = found[k];
    if (!raw) return [k, def];
    try { return [k, JSON.parse(raw)]; } catch { return [k, def]; }
  }));
}

async function setSetting(key: string, value: object) {
  await db.insert(settingsTable).values({ key, value: JSON.stringify(value) })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: JSON.stringify(value), updatedAt: new Date() } });
  invalidateCache("site-config:public"); // bust public cache on any setting change
}

const DEFAULT_HERO = {
  enabled: true,
  size: "compact" as "compact" | "medium" | "large",
  badge: "✦ Multi-Chain Faucet Hub",
  headline: "Get Free Crypto Tokens",
  headlineHighlight: "Instantly & For Free",
  subtext: "Claim testnet & mainnet tokens across multiple chains. No registration, no fees — just your wallet address.",
  showStats: true,
};

const DEFAULT_DONATION_ADDRESSES: { chain: string; symbol: string; address: string }[] = [];
const DEFAULT_ANTI_ABUSE_CONFIG = { enabled: true, blockVpn: true, blockProxy: true, blockTor: true, blockDatacenter: false };
const DEFAULT_SOCIAL = { twitter: "", telegram: "", discord: "", github: "", email: "" };
const DEFAULT_INFEED_AD = { enabled: false, adCode: "", firstPosition: 4, interval: 6 };
const DEFAULT_SEO = { title: "ChainDrop — Multi-Chain Crypto Faucet Hub", description: "Get free testnet crypto tokens from ChainDrop. Supports multiple EVM-compatible chains including Sepolia and more.", ogImage: "" };
const DEFAULT_MAINTENANCE = { enabled: false, message: "We're currently performing maintenance. Please check back soon." };
const DEFAULT_RATELIMIT = { maxAttempts: 5, lockoutMinutes: 15 };
const DEFAULT_IPCLAIMCONFIG = { enabled: false, windowHours: 24, maxClaimsPerWindow: 2 };
const DEFAULT_INTEGRATIONS = {
  googleAds: { enabled: false, publisherId: "", slots: { header: "", inContent: "", footer: "" } },
  googleAnalytics: { enabled: false, measurementId: "" },
  googleSearchConsole: { verificationCode: "" },
  customMetaTags: "",
};

// ── Public endpoint (for footer social links, SEO meta, maintenance banner) ────
router.get("/site-config/public", async (_req, res): Promise<void> => {
  const cached = getCached<object>("site-config:public");
  if (cached) { res.json(cached); return; }

  // Single batched query instead of 6 separate getSetting() calls
  const settings = await getSettingsBatch([
    ["socialLinks",       DEFAULT_SOCIAL],
    ["seoSettings",       DEFAULT_SEO],
    ["maintenanceMode",   DEFAULT_MAINTENANCE],
    ["integrations",      DEFAULT_INTEGRATIONS],
    ["heroSection",       DEFAULT_HERO],
    ["donationAddresses", DEFAULT_DONATION_ADDRESSES],
    ["inFeedAd",          DEFAULT_INFEED_AD],
  ]);

  const social      = settings["socialLinks"]       as typeof DEFAULT_SOCIAL;
  const seo         = settings["seoSettings"]       as typeof DEFAULT_SEO;
  const maintenance = settings["maintenanceMode"]   as typeof DEFAULT_MAINTENANCE;
  const integrations    = settings["integrations"];
  const heroSection     = settings["heroSection"];
  const donationAddresses = settings["donationAddresses"];
  const inFeedAd    = settings["inFeedAd"]          as typeof DEFAULT_INFEED_AD;

  const result = {
    socialLinks: social,
    seoTitle: seo.title,
    seoDescription: seo.description,
    seoOgImage: seo.ogImage,
    maintenanceEnabled: maintenance.enabled,
    maintenanceMessage: maintenance.message,
    integrations,
    heroSection,
    donationAddresses,
    inFeedAd,
  };

  setCached("site-config:public", result, 5 * 60_000); // 5 minutes
  res.json(result);
});

// ── Admin: get all config ─────────────────────────────────────────────────────
router.get("/admin/site-config", requireAdmin, async (_req, res): Promise<void> => {
  const [socialLinks, seoSettings, maintenanceMode, rateLimitConfig, ipClaimConfig, integrations, heroSection, donationAddresses, inFeedAd] = await Promise.all([
    getSetting("socialLinks", DEFAULT_SOCIAL),
    getSetting("seoSettings", DEFAULT_SEO),
    getSetting("maintenanceMode", DEFAULT_MAINTENANCE),
    getSetting("rateLimitConfig", DEFAULT_RATELIMIT),
    getSetting("ipClaimConfig", DEFAULT_IPCLAIMCONFIG),
    getSetting("integrations", DEFAULT_INTEGRATIONS),
    getSetting("heroSection", DEFAULT_HERO),
    getSetting("donationAddresses", DEFAULT_DONATION_ADDRESSES),
    getSetting("inFeedAd", DEFAULT_INFEED_AD),
  ]);
  res.json({ socialLinks, seoSettings, maintenanceMode, rateLimitConfig, ipClaimConfig, integrations, heroSection, donationAddresses, inFeedAd });
});

// ── Admin: update sections ────────────────────────────────────────────────────
router.patch("/admin/site-config/socialLinks", requireAdmin, async (req, res): Promise<void> => {
  const { twitter, telegram, discord, github, email } = req.body as Record<string, unknown>;
  await setSetting("socialLinks", {
    twitter: typeof twitter === "string" ? twitter.trim() : "",
    telegram: typeof telegram === "string" ? telegram.trim() : "",
    discord: typeof discord === "string" ? discord.trim() : "",
    github: typeof github === "string" ? github.trim() : "",
    email: typeof email === "string" ? email.trim() : "",
  });
  res.json({ ok: true });
});

router.patch("/admin/site-config/seoSettings", requireAdmin, async (req, res): Promise<void> => {
  const { title, description, ogImage } = req.body as Record<string, unknown>;
  await setSetting("seoSettings", {
    title: typeof title === "string" ? title.trim() : DEFAULT_SEO.title,
    description: typeof description === "string" ? description.trim() : DEFAULT_SEO.description,
    ogImage: typeof ogImage === "string" ? ogImage.trim() : "",
  });
  res.json({ ok: true });
});

router.patch("/admin/site-config/maintenanceMode", requireAdmin, async (req, res): Promise<void> => {
  const { enabled, message } = req.body as Record<string, unknown>;
  await setSetting("maintenanceMode", {
    enabled: enabled === true,
    message: typeof message === "string" ? message.trim() : DEFAULT_MAINTENANCE.message,
  });
  res.json({ ok: true });
});

router.patch("/admin/site-config/rateLimitConfig", requireAdmin, async (req, res): Promise<void> => {
  const { maxAttempts, lockoutMinutes } = req.body as Record<string, unknown>;
  await setSetting("rateLimitConfig", {
    maxAttempts: Math.max(1, Math.min(20, Number(maxAttempts) || 5)),
    lockoutMinutes: Math.max(1, Math.min(1440, Number(lockoutMinutes) || 15)),
  });
  res.json({ ok: true });
});

router.patch("/admin/site-config/ipClaimConfig", requireAdmin, async (req, res): Promise<void> => {
  const { enabled, windowHours, maxClaimsPerWindow } = req.body as Record<string, unknown>;
  await setSetting("ipClaimConfig", {
    enabled:            enabled === true,
    windowHours:        Math.max(1, Math.min(168, Number(windowHours)        || 24)),
    maxClaimsPerWindow: Math.max(1, Math.min(200, Number(maxClaimsPerWindow) || 2)),
  });
  res.json({ ok: true });
});

router.patch("/admin/site-config/integrations", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const ga = (body.googleAds ?? {}) as Record<string, unknown>;
  const gaSlots = (typeof ga.slots === "object" && ga.slots !== null ? ga.slots : {}) as Record<string, unknown>;
  const analytics = (body.googleAnalytics ?? {}) as Record<string, unknown>;
  const gsc = (body.googleSearchConsole ?? {}) as Record<string, unknown>;
  await setSetting("integrations", {
    googleAds: {
      enabled: ga.enabled === true,
      publisherId: typeof ga.publisherId === "string" ? ga.publisherId.trim() : "",
      slots: {
        header: typeof gaSlots.header === "string" ? gaSlots.header.trim() : "",
        inContent: typeof gaSlots.inContent === "string" ? gaSlots.inContent.trim() : "",
        footer: typeof gaSlots.footer === "string" ? gaSlots.footer.trim() : "",
      },
    },
    googleAnalytics: {
      enabled: analytics.enabled === true,
      measurementId: typeof analytics.measurementId === "string" ? analytics.measurementId.trim() : "",
    },
    googleSearchConsole: {
      verificationCode: typeof gsc.verificationCode === "string" ? gsc.verificationCode.trim() : "",
    },
    customMetaTags: typeof body.customMetaTags === "string" ? body.customMetaTags : "",
  });
  res.json({ ok: true });
});

router.patch("/admin/site-config/heroSection", requireAdmin, async (req, res): Promise<void> => {
  const b = req.body as Record<string, unknown>;
  const validSizes = ["compact", "medium", "large"];
  await setSetting("heroSection", {
    enabled:            b.enabled === true,
    size:               validSizes.includes(b.size as string) ? b.size : "compact",
    badge:              typeof b.badge             === "string" ? b.badge.trim()             : DEFAULT_HERO.badge,
    headline:           typeof b.headline          === "string" ? b.headline.trim()          : DEFAULT_HERO.headline,
    headlineHighlight:  typeof b.headlineHighlight === "string" ? b.headlineHighlight.trim() : DEFAULT_HERO.headlineHighlight,
    subtext:            typeof b.subtext           === "string" ? b.subtext.trim()           : DEFAULT_HERO.subtext,
    showStats:          b.showStats !== false,
  });
  res.json({ ok: true });
});

router.get("/admin/site-config/antiAbuseConfig", requireAdmin, async (_req, res): Promise<void> => {
  const cfg = await getSetting("antiAbuseConfig", DEFAULT_ANTI_ABUSE_CONFIG);
  res.json(cfg);
});

router.patch("/admin/site-config/antiAbuseConfig", requireAdmin, async (req, res): Promise<void> => {
  const b = req.body as Record<string, unknown>;
  await setSetting("antiAbuseConfig", {
    enabled:         b.enabled         !== false,
    blockVpn:        b.blockVpn        !== false,
    blockProxy:      b.blockProxy      !== false,
    blockTor:        b.blockTor        !== false,
    blockDatacenter: b.blockDatacenter === true,
  });
  res.json({ ok: true });
});

router.patch("/admin/site-config/inFeedAd", requireAdmin, async (req, res): Promise<void> => {
  const b = req.body as Record<string, unknown>;
  await setSetting("inFeedAd", {
    enabled:       b.enabled === true,
    adCode:        typeof b.adCode       === "string" ? b.adCode       : "",
    firstPosition: Math.max(1, Math.min(20, Number(b.firstPosition) || 4)),
    interval:      Math.max(2, Math.min(50, Number(b.interval)      || 6)),
    name:          typeof b.name         === "string" ? b.name         : "",
  });
  res.json({ ok: true });
});

router.patch("/admin/site-config/donationAddresses", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body;
  if (!Array.isArray(body)) { res.status(400).json({ error: "Expected an array" }); return; }
  const cleaned = body
    .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
    .map(e => ({
      chain:   typeof e.chain   === "string" ? e.chain.trim()   : "",
      symbol:  typeof e.symbol  === "string" ? e.symbol.trim()  : "",
      address: typeof e.address === "string" ? e.address.trim() : "",
    }))
    .filter(e => e.chain && e.symbol && e.address);
  await setSetting("donationAddresses", cleaned);
  res.json({ ok: true });
});

// ── Verification Files ────────────────────────────────────────────────────────

interface VerifyFile { filename: string; content: string; }
const DEFAULT_VERIFY_FILES: VerifyFile[] = [];

function getPublicDir(): string {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "artifacts", "faucet-hub", "public"),
    path.join(cwd, "..", "faucet-hub", "public"),
    path.join(cwd, "..", "..", "faucet-hub", "public"),
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* skip */ }
  }
  return candidates[0];
}

function isValidVerifyFilename(name: string): boolean {
  return /^[a-zA-Z0-9_-]{1,80}\.(txt|html|htm|js)$/.test(name);
}

router.get("/admin/verify-files", requireAdmin, async (_req, res): Promise<void> => {
  const files = await getSetting("verificationFiles", DEFAULT_VERIFY_FILES);
  res.json(files);
});

router.post("/admin/verify-files", requireAdmin, async (req, res): Promise<void> => {
  const { filename, content } = req.body as { filename?: string; content?: string };
  if (!filename || !isValidVerifyFilename(filename.trim())) {
    res.status(400).json({ error: "Invalid filename. Letters/numbers/hyphens only, .txt, .html or .js extension." });
    return;
  }
  if (typeof content !== "string") {
    res.status(400).json({ error: "content is required" });
    return;
  }
  const entry: VerifyFile = { filename: filename.trim(), content: content.trim() };
  const files = await getSetting("verificationFiles", DEFAULT_VERIFY_FILES) as VerifyFile[];
  const idx = files.findIndex(f => f.filename === entry.filename);
  if (idx >= 0) files[idx] = entry; else files.push(entry);
  await setSetting("verificationFiles", files);
  try {
    fs.writeFileSync(path.join(getPublicDir(), entry.filename), entry.content, "utf-8");
  } catch { /* public dir may not be available in production */ }
  res.status(201).json(entry);
});

router.delete("/admin/verify-files/:filename", requireAdmin, async (req, res): Promise<void> => {
  const filename = String(req.params.filename).trim();
  if (!isValidVerifyFilename(filename)) { res.status(400).json({ error: "Invalid filename" }); return; }
  const files = await getSetting("verificationFiles", DEFAULT_VERIFY_FILES) as VerifyFile[];
  await setSetting("verificationFiles", files.filter(f => f.filename !== filename));
  try { fs.unlinkSync(path.join(getPublicDir(), filename)); } catch { /* ignore */ }
  res.sendStatus(204);
});

// ── Admin: IP Blocks ──────────────────────────────────────────────────────────
router.get("/admin/ip-blocks", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(ipBlocksTable).orderBy(ipBlocksTable.blockedAt);
  res.json(rows.map(r => ({ ip: r.ip, reason: r.reason, blockedAt: r.blockedAt.toISOString() })));
});

router.post("/admin/ip-blocks", requireAdmin, async (req, res): Promise<void> => {
  const { ip, reason } = req.body as { ip?: string; reason?: string };
  if (!ip || typeof ip !== "string") { res.status(400).json({ error: "ip is required" }); return; }
  const normalized = ip.trim();
  const v4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const v6 = /^[0-9a-f:]+$/i;
  if (!v4.test(normalized) && !v6.test(normalized)) { res.status(400).json({ error: "Invalid IP address" }); return; }
  const [row] = await db.insert(ipBlocksTable)
    .values({ ip: normalized, reason: (reason ?? "").trim() })
    .onConflictDoUpdate({ target: ipBlocksTable.ip, set: { reason: (reason ?? "").trim() } })
    .returning();
  res.status(201).json({ ip: row!.ip, reason: row!.reason, blockedAt: row!.blockedAt.toISOString() });
});

router.post("/admin/ip-blocks/bulk", requireAdmin, async (req, res): Promise<void> => {
  const { ips, reason } = req.body as { ips?: unknown; reason?: string };
  if (!Array.isArray(ips) || ips.length === 0) {
    res.status(400).json({ error: "ips array is required" }); return;
  }
  const v4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const v6 = /^[0-9a-f:]+$/i;
  const normalized = (ips as unknown[])
    .map(ip => (typeof ip === "string" ? ip.trim() : ""))
    .filter(ip => v4.test(ip) || v6.test(ip));
  if (normalized.length === 0) {
    res.status(400).json({ error: "No valid IP addresses provided" }); return;
  }
  const reasonStr = (reason ?? "").trim();
  const rows = await db.insert(ipBlocksTable)
    .values(normalized.map(ip => ({ ip, reason: reasonStr })))
    .onConflictDoUpdate({ target: ipBlocksTable.ip, set: { reason: reasonStr } })
    .returning();
  res.status(201).json({ blocked: rows.length, ips: rows.map(r => r.ip) });
});

router.delete("/admin/ip-blocks/:ip", requireAdmin, async (req, res): Promise<void> => {
  const ip = String(req.params.ip).trim();
  await db.delete(ipBlocksTable).where(eq(ipBlocksTable.ip, ip));
  res.sendStatus(204);
});

// ── Global Video Ads (VAST pool) ──────────────────────────────────────────────

interface GlobalVideoAd {
  id: string;
  name: string;
  url: string;
  type: "vast" | "mp4";
  enabled: boolean;
  priority: number;
}

const DEFAULT_GLOBAL_VIDEO_ADS: GlobalVideoAd[] = [];

router.get("/admin/ads/video-ads", requireAdmin, async (_req, res): Promise<void> => {
  const ads = await getSetting("globalVideoAds", DEFAULT_GLOBAL_VIDEO_ADS);
  res.json(ads);
});

router.post("/admin/ads/video-ads", requireAdmin, async (req, res): Promise<void> => {
  const { name, url, type } = req.body as { name?: string; url?: string; type?: string };
  if (!name?.trim() || !url?.trim()) {
    res.status(400).json({ error: "name and url are required" });
    return;
  }
  const ads = await getSetting("globalVideoAds", DEFAULT_GLOBAL_VIDEO_ADS);
  const newAd: GlobalVideoAd = {
    id: crypto.randomUUID(),
    name: name.trim(),
    url: url.trim(),
    type: type === "mp4" ? "mp4" : "vast",
    enabled: true,
    priority: ads.length,
  };
  ads.push(newAd);
  await setSetting("globalVideoAds", ads);
  res.status(201).json(newAd);
});

router.patch("/admin/ads/video-ads/:id", requireAdmin, async (req, res): Promise<void> => {
  const { id } = req.params as { id: string };
  const body = req.body as Partial<GlobalVideoAd>;
  const ads = await getSetting("globalVideoAds", DEFAULT_GLOBAL_VIDEO_ADS);
  const idx = ads.findIndex(a => a.id === id);
  if (idx === -1) { res.status(404).json({ error: "Not found" }); return; }
  const ad = ads[idx]!;
  if (body.name     !== undefined) ad.name     = body.name;
  if (body.url      !== undefined) ad.url      = body.url;
  if (body.type     !== undefined) ad.type     = body.type === "mp4" ? "mp4" : "vast";
  if (body.enabled  !== undefined) ad.enabled  = body.enabled;
  if (body.priority !== undefined) ad.priority = body.priority;
  await setSetting("globalVideoAds", ads);
  res.json(ad);
});

router.delete("/admin/ads/video-ads/:id", requireAdmin, async (req, res): Promise<void> => {
  const { id } = req.params as { id: string };
  const ads = await getSetting("globalVideoAds", DEFAULT_GLOBAL_VIDEO_ADS);
  const filtered = ads.filter(a => a.id !== id);
  if (filtered.length === ads.length) { res.status(404).json({ error: "Not found" }); return; }
  await setSetting("globalVideoAds", filtered);
  res.sendStatus(204);
});

export default router;
