import { db, ipRepCacheTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PRIVATE_PREFIXES = ["10.", "192.168.", "127.", "::1", "fc00:", "fe80:"];

export interface IpRepResult {
  country: string;
  countryCode: string;
  isp: string;
  org: string;
  vpnDetected: boolean;
  proxyDetected: boolean;
  torDetected: boolean;
  datacenterDetected: boolean;
  reputationScore: number; // 0-100, higher is cleaner
}

const CLEAN: IpRepResult = {
  country: "Unknown", countryCode: "XX", isp: "", org: "",
  vpnDetected: false, proxyDetected: false, torDetected: false, datacenterDetected: false,
  reputationScore: 100,
};

function isPrivateIp(ip: string): boolean {
  return PRIVATE_PREFIXES.some(p => ip.startsWith(p));
}

function calcScore(rep: Omit<IpRepResult, "reputationScore">): number {
  let score = 100;
  if (rep.torDetected)        score -= 50;
  if (rep.proxyDetected)      score -= 35;
  if (rep.vpnDetected)        score -= 30;
  if (rep.datacenterDetected) score -= 20;
  return Math.max(0, score);
}

async function fetchFromApi(ip: string): Promise<IpRepResult> {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,isp,org,proxy,hosting`,
      { signal: ctrl.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return CLEAN;
    const data = await res.json() as {
      status: string; country?: string; countryCode?: string;
      isp?: string; org?: string; proxy?: boolean; hosting?: boolean;
    };
    if (data.status !== "success") return CLEAN;
    const rep = {
      country:            data.country     ?? "Unknown",
      countryCode:        data.countryCode ?? "XX",
      isp:                data.isp         ?? "",
      org:                data.org         ?? "",
      vpnDetected:        data.proxy       === true,
      proxyDetected:      data.proxy       === true,
      torDetected:        false,
      datacenterDetected: data.hosting     === true,
    };
    return { ...rep, reputationScore: calcScore(rep) };
  } catch {
    return CLEAN;
  }
}

export async function getIpReputation(ip: string): Promise<IpRepResult> {
  if (isPrivateIp(ip)) return CLEAN;

  // Check cache
  try {
    const [cached] = await db.select().from(ipRepCacheTable).where(eq(ipRepCacheTable.ip, ip)).limit(1);
    if (cached && (Date.now() - cached.checkedAt.getTime()) < CACHE_TTL_MS) {
      return {
        country:            cached.country            ?? "Unknown",
        countryCode:        cached.countryCode        ?? "XX",
        isp:                cached.isp                ?? "",
        org:                cached.org                ?? "",
        vpnDetected:        cached.vpnDetected        ?? false,
        proxyDetected:      cached.proxyDetected      ?? false,
        torDetected:        cached.torDetected        ?? false,
        datacenterDetected: cached.datacenterDetected ?? false,
        reputationScore:    cached.reputationScore    ?? 100,
      };
    }
  } catch { /* fallthrough */ }

  const rep = await fetchFromApi(ip);

  // Cache result
  try {
    await db
      .insert(ipRepCacheTable)
      .values({ ip, ...rep, checkedAt: new Date() })
      .onConflictDoUpdate({
        target: ipRepCacheTable.ip,
        set: { ...rep, checkedAt: new Date() },
      });
  } catch { /* non-critical */ }

  return rep;
}
