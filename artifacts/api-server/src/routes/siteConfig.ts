import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable, ipBlocksTable } from "@workspace/db";
import { requireAdmin } from "../lib/adminAuth";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
  if (!row?.value) return fallback;
  try { return JSON.parse(row.value) as T; } catch { return fallback; }
}

async function setSetting(key: string, value: object) {
  await db.insert(settingsTable).values({ key, value: JSON.stringify(value) })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: JSON.stringify(value), updatedAt: new Date() } });
}

const DEFAULT_SOCIAL = { twitter: "", telegram: "", discord: "", github: "" };
const DEFAULT_SEO = { title: "ChainDrop — Multi-Chain Crypto Faucet Hub", description: "Get free testnet crypto tokens from ChainDrop. Supports multiple EVM-compatible chains including Sepolia and more.", ogImage: "" };
const DEFAULT_MAINTENANCE = { enabled: false, message: "We're currently performing maintenance. Please check back soon." };
const DEFAULT_RATELIMIT = { maxAttempts: 5, lockoutMinutes: 15 };
const DEFAULT_IPCLAIMCONFIG = { dailyFreeChains: 2, cooldownHours: 0 };
const DEFAULT_INTEGRATIONS = {
  googleAds: { enabled: false, publisherId: "", slots: { header: "", inContent: "", footer: "" } },
  googleAnalytics: { enabled: false, measurementId: "" },
  googleSearchConsole: { verificationCode: "" },
};

// ── Public endpoint (for footer social links, SEO meta, maintenance banner) ────
router.get("/site-config/public", async (_req, res): Promise<void> => {
  const [social, seo, maintenance, integrations] = await Promise.all([
    getSetting("socialLinks", DEFAULT_SOCIAL),
    getSetting("seoSettings", DEFAULT_SEO),
    getSetting("maintenanceMode", DEFAULT_MAINTENANCE),
    getSetting("integrations", DEFAULT_INTEGRATIONS),
  ]);
  res.json({
    socialLinks: social,
    seoTitle: seo.title,
    seoDescription: seo.description,
    seoOgImage: seo.ogImage,
    maintenanceEnabled: maintenance.enabled,
    maintenanceMessage: maintenance.message,
    integrations,
  });
});

// ── Admin: get all config ─────────────────────────────────────────────────────
router.get("/admin/site-config", requireAdmin, async (_req, res): Promise<void> => {
  const [socialLinks, seoSettings, maintenanceMode, rateLimitConfig, ipClaimConfig, integrations] = await Promise.all([
    getSetting("socialLinks", DEFAULT_SOCIAL),
    getSetting("seoSettings", DEFAULT_SEO),
    getSetting("maintenanceMode", DEFAULT_MAINTENANCE),
    getSetting("rateLimitConfig", DEFAULT_RATELIMIT),
    getSetting("ipClaimConfig", DEFAULT_IPCLAIMCONFIG),
    getSetting("integrations", DEFAULT_INTEGRATIONS),
  ]);
  res.json({ socialLinks, seoSettings, maintenanceMode, rateLimitConfig, ipClaimConfig, integrations });
});

// ── Admin: update sections ────────────────────────────────────────────────────
router.patch("/admin/site-config/socialLinks", requireAdmin, async (req, res): Promise<void> => {
  const { twitter, telegram, discord, github } = req.body as Record<string, unknown>;
  await setSetting("socialLinks", {
    twitter: typeof twitter === "string" ? twitter.trim() : "",
    telegram: typeof telegram === "string" ? telegram.trim() : "",
    discord: typeof discord === "string" ? discord.trim() : "",
    github: typeof github === "string" ? github.trim() : "",
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
  const { dailyFreeChains, cooldownHours } = req.body as Record<string, unknown>;
  await setSetting("ipClaimConfig", {
    dailyFreeChains: Math.max(1, Math.min(50, Number(dailyFreeChains) || 2)),
    cooldownHours:   Math.max(0, Math.min(168, Number(cooldownHours)  || 0)),
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
  });
  res.json({ ok: true });
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

router.delete("/admin/ip-blocks/:ip", requireAdmin, async (req, res): Promise<void> => {
  const ip = String(req.params.ip).trim();
  await db.delete(ipBlocksTable).where(eq(ipBlocksTable.ip, ip));
  res.sendStatus(204);
});

export default router;
