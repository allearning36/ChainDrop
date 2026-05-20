import { Router, type IRouter, type Request } from "express";
import { desc, sql, gte, count, countDistinct } from "drizzle-orm";
import { db, pageViewsTable } from "@workspace/db";
import { requireAdmin } from "../lib/adminAuth";
import { trackLimiter } from "../lib/rateLimiters";
import geoip from "geoip-lite";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getClientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "unknown";
}

function detectDevice(ua: string): "mobile" | "tablet" | "desktop" {
  const u = ua.toLowerCase();
  if (/ipad|tablet|(android(?!.*mobile))/.test(u)) return "tablet";
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/.test(u)) return "mobile";
  return "desktop";
}

function lookupCountry(ip: string): { country: string | null; countryCode: string | null } {
  try {
    const geo = geoip.lookup(ip);
    if (!geo) return { country: null, countryCode: null };
    return { country: geo.country, countryCode: geo.country };
  } catch {
    return { country: null, countryCode: null };
  }
}

// Country code → full name mapping (most common)
const COUNTRY_NAMES: Record<string, string> = {
  US:"United States",GB:"United Kingdom",IN:"India",DE:"Germany",FR:"France",
  CA:"Canada",AU:"Australia",BR:"Brazil",JP:"Japan",CN:"China",KR:"South Korea",
  RU:"Russia",MX:"Mexico",IT:"Italy",ES:"Spain",NL:"Netherlands",PL:"Poland",
  SE:"Sweden",NO:"Norway",DK:"Denmark",FI:"Finland",CH:"Switzerland",AT:"Austria",
  BE:"Belgium",PT:"Portugal",CZ:"Czech Republic",HU:"Hungary",RO:"Romania",
  BG:"Bulgaria",HR:"Croatia",SK:"Slovakia",SI:"Slovenia",EE:"Estonia",LV:"Latvia",
  LT:"Lithuania",TR:"Turkey",UA:"Ukraine",BD:"Bangladesh",PK:"Pakistan",ID:"Indonesia",
  MY:"Malaysia",SG:"Singapore",TH:"Thailand",PH:"Philippines",VN:"Vietnam",
  ZA:"South Africa",NG:"Nigeria",EG:"Egypt",KE:"Kenya",GH:"Ghana",TZ:"Tanzania",
  AR:"Argentina",CO:"Colombia",CL:"Chile",PE:"Peru",VE:"Venezuela",
  SA:"Saudi Arabia",AE:"UAE",IL:"Israel",IR:"Iran",IQ:"Iraq",
  LK:"Sri Lanka",NP:"Nepal",MM:"Myanmar",KH:"Cambodia",
  NZ:"New Zealand",HK:"Hong Kong",TW:"Taiwan",
};

function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

// ── POST /api/track ───────────────────────────────────────────────────────────
// Frontend calls this once per page navigation. Rate-limited to prevent spam.
router.post("/track", trackLimiter, async (req, res): Promise<void> => {
  const ip = getClientIp(req);
  const ua = req.headers["user-agent"] ?? "";
  const path = typeof req.body?.path === "string"
    ? req.body.path.slice(0, 256)
    : "/";

  const { country, countryCode } = lookupCountry(ip);
  const deviceType = detectDevice(ua);

  await db.insert(pageViewsTable).values({
    ip,
    country: country ? countryName(country) : null,
    countryCode,
    path,
    userAgent: ua.slice(0, 512),
    deviceType,
  });

  res.status(204).end();
});

// ── GET /api/admin/audience ───────────────────────────────────────────────────
router.get("/admin/audience", requireAdmin, async (_req, res): Promise<void> => {
  const now = new Date();
  const startOfToday   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOf7Days   = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
  const startOf30Days  = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalRow,
    todayRow,
    weekRow,
    monthRow,
    dailyRows,
    countryRows,
    deviceRows,
    pageRows,
    recentRows,
    newVsReturning,
  ] = await Promise.all([
    // All-time unique IPs
    db.select({ count: countDistinct(pageViewsTable.ip) }).from(pageViewsTable),

    // Today unique IPs
    db.select({ count: countDistinct(pageViewsTable.ip) })
      .from(pageViewsTable).where(gte(pageViewsTable.visitedAt, startOfToday)),

    // Last 7 days unique IPs
    db.select({ count: countDistinct(pageViewsTable.ip) })
      .from(pageViewsTable).where(gte(pageViewsTable.visitedAt, startOf7Days)),

    // Last 30 days unique IPs
    db.select({ count: countDistinct(pageViewsTable.ip) })
      .from(pageViewsTable).where(gte(pageViewsTable.visitedAt, startOf30Days)),

    // Daily unique visitors for last 30 days
    db.select({
      date:    sql<string>`date(${pageViewsTable.visitedAt} AT TIME ZONE 'UTC')::text`,
      unique:  countDistinct(pageViewsTable.ip),
      total:   count(),
    }).from(pageViewsTable)
      .where(gte(pageViewsTable.visitedAt, startOf30Days))
      .groupBy(sql`date(${pageViewsTable.visitedAt} AT TIME ZONE 'UTC')`)
      .orderBy(sql`date(${pageViewsTable.visitedAt} AT TIME ZONE 'UTC')`),

    // Top countries (last 30 days)
    db.select({
      country:     pageViewsTable.country,
      countryCode: pageViewsTable.countryCode,
      unique:      countDistinct(pageViewsTable.ip),
    }).from(pageViewsTable)
      .where(gte(pageViewsTable.visitedAt, startOf30Days))
      .groupBy(pageViewsTable.country, pageViewsTable.countryCode)
      .orderBy(desc(countDistinct(pageViewsTable.ip)))
      .limit(10),

    // Device breakdown (last 30 days)
    db.select({
      deviceType: pageViewsTable.deviceType,
      count:      count(),
    }).from(pageViewsTable)
      .where(gte(pageViewsTable.visitedAt, startOf30Days))
      .groupBy(pageViewsTable.deviceType),

    // Top pages (last 30 days)
    db.select({
      path:  pageViewsTable.path,
      views: count(),
      unique: countDistinct(pageViewsTable.ip),
    }).from(pageViewsTable)
      .where(gte(pageViewsTable.visitedAt, startOf30Days))
      .groupBy(pageViewsTable.path)
      .orderBy(desc(count()))
      .limit(10),

    // Recent 20 visits
    db.select().from(pageViewsTable)
      .orderBy(desc(pageViewsTable.visitedAt))
      .limit(20),

    // New vs returning (all time): IPs that appear for the first time today vs have prior visits
    db.select({
      isNew: sql<boolean>`min(${pageViewsTable.visitedAt}) >= ${startOfToday}`,
      count: countDistinct(pageViewsTable.ip),
    }).from(pageViewsTable)
      .groupBy(pageViewsTable.ip),
  ]);

  // Compute new vs returning from the grouped result
  let newVisitors = 0, returningVisitors = 0;
  for (const row of newVsReturning) {
    if (row.isNew) newVisitors    += Number(row.count);
    else           returningVisitors += Number(row.count);
  }

  // Total visits for country percentage calculation
  const totalCountryVisits = countryRows.reduce((s, r) => s + Number(r.unique), 0);

  res.json({
    summary: {
      allTime:  Number(totalRow[0]?.count ?? 0),
      today:    Number(todayRow[0]?.count ?? 0),
      weekly:   Number(weekRow[0]?.count ?? 0),
      monthly:  Number(monthRow[0]?.count ?? 0),
      newToday: newVisitors,
      returning: returningVisitors,
    },
    dailyChart: dailyRows.map(r => ({
      date:   r.date,
      unique: Number(r.unique),
      total:  Number(r.total),
    })),
    topCountries: countryRows.map(r => ({
      country:     r.country ?? "Unknown",
      countryCode: r.countryCode ?? "??",
      unique:      Number(r.unique),
      pct: totalCountryVisits > 0
        ? Math.round((Number(r.unique) / totalCountryVisits) * 100)
        : 0,
    })),
    devices: {
      desktop: 0,
      mobile:  0,
      tablet:  0,
      ...Object.fromEntries(
        deviceRows.map(r => [r.deviceType ?? "desktop", Number(r.count)])
      ),
    },
    topPages: pageRows.map(r => ({
      path:   r.path,
      views:  Number(r.views),
      unique: Number(r.unique),
    })),
    recentVisits: recentRows.map(r => ({
      ip:          r.ip.replace(/(\d+\.\d+)\.\d+\.\d+/, "$1.x.x"),  // partial mask
      country:     r.country ?? "Unknown",
      countryCode: r.countryCode ?? "??",
      path:        r.path,
      deviceType:  r.deviceType ?? "desktop",
      visitedAt:   r.visitedAt.toISOString(),
    })),
  });
});

export default router;
