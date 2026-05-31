/**
 * Anti-abuse protection engine for ChainDrop faucet.
 *
 * Computes a trust score (0-100) from multiple signals and determines
 * whether a claim attempt should be allowed, flagged, or blocked.
 */
import { db, abuseLogsTable, autoBansTable, claimsTable, settingsTable } from "@workspace/db";
import { eq, and, gte, gt, desc, lt, sql } from "drizzle-orm";
import { getIpReputation, type IpRepResult } from "./ipReputation";
import { ethers } from "ethers";

// ── Anti-abuse config ─────────────────────────────────────────────────────────
export interface AntiAbuseConfig {
  enabled:          boolean;
  blockVpn:         boolean;
  blockProxy:       boolean;
  blockTor:         boolean;
  blockDatacenter:  boolean;
}

export const DEFAULT_ANTI_ABUSE_CONFIG: AntiAbuseConfig = {
  enabled:         true,
  blockVpn:        true,
  blockProxy:      true,
  blockTor:        true,
  blockDatacenter: false,
};

let _configCache: { value: AntiAbuseConfig; ts: number } | null = null;
const CONFIG_CACHE_MS = 60_000; // refresh config every 60s

export async function getAntiAbuseConfig(): Promise<AntiAbuseConfig> {
  if (_configCache && Date.now() - _configCache.ts < CONFIG_CACHE_MS) {
    return _configCache.value;
  }
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "antiAbuseConfig")).limit(1);
    if (row?.value) {
      const parsed = JSON.parse(row.value) as Partial<AntiAbuseConfig>;
      const value: AntiAbuseConfig = { ...DEFAULT_ANTI_ABUSE_CONFIG, ...parsed };
      _configCache = { value, ts: Date.now() };
      return value;
    }
  } catch { /* fallthrough */ }
  _configCache = { value: DEFAULT_ANTI_ABUSE_CONFIG, ts: Date.now() };
  return DEFAULT_ANTI_ABUSE_CONFIG;
}

const BLOCK_SCORE     = 10;   // trust < this → block (only genuine bad actors)
const WARN_SCORE      = 28;   // trust < this → log warning
const STARTING_SCORE  = 65;   // raised: give users benefit of the doubt

// ── Trust score adjustments ─────────────────────────────────────────────────
// NOTE: Bangladesh & similar markets use CGNAT (shared mobile IPs) which get
// misclassified as proxy/datacenter by IP reputation services. Penalties are
// deliberately lenient to avoid false-positives on legitimate mobile users.
const PENALTIES = {
  TOR:           -50,  // genuine anonymization → still high
  PROXY:         -20,  // was -35; mobile ISPs often misclassified
  VPN:           -15,  // was -30; not conclusive on its own
  DATACENTER:    -10,  // was -20; mobile carrier IPs often look like DC
  MANY_WALLETS_SAME_FP:  -15, // >4 wallets from same fingerprint in 24h (was >2)
  MANY_CLAIMS_SAME_IP:   -10, // >8 claims from same IP in 1h (was >3, CGNAT)
  RAPID_REQUESTS:        -30, // <5s between requests (kept high, clear bot signal)
  NO_FINGERPRINT:         -5, // was -10; many browsers block fingerprinting
  KNOWN_BAD_FP:          -40,
};
const BONUSES = {
  SIG_VERIFIED:   +20,
  ESTABLISHED:    +10, // address has >3 prior claims
};

export interface ClaimContext {
  address:     string;
  ip:          string;
  fingerprint?: string;
  userAgent?:  string;
  timezone?:   string;
  chainId:     number;
  signature?:  string;
  nonce?:      string;
}

export interface AbuseDecision {
  allowed:     boolean;
  trustScore:  number;
  flags:       string[];
  reason?:     string;
  ipRep:       IpRepResult;
  country:     string;
  vpnDetected: boolean;
  sigVerified: boolean;
}

// ── Wallet signature verification ────────────────────────────────────────────
export async function verifyWalletSignature(
  address: string,
  nonce: string,
  signature: string
): Promise<boolean> {
  try {
    const message = `ChainDrop claim verification\nAddress: ${address}\nNonce: ${nonce}`;
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}

// ── Auto-ban helpers ─────────────────────────────────────────────────────────
async function isAutoBanned(type: string, value: string): Promise<string | null> {
  const [ban] = await db
    .select()
    .from(autoBansTable)
    .where(
      and(
        eq(autoBansTable.targetType,  type),
        eq(autoBansTable.targetValue, value),
        gt(autoBansTable.expiresAt,   new Date()),
      )
    )
    .limit(1);
  return ban ? ban.reason : null;
}

async function applyAutoBan(
  type: string, value: string, reason: string, trustScore: number
): Promise<void> {
  // Check existing bans to determine duration
  const [existing] = await db
    .select()
    .from(autoBansTable)
    .where(and(eq(autoBansTable.targetType, type), eq(autoBansTable.targetValue, value)))
    .orderBy(desc(autoBansTable.createdAt))
    .limit(1);

  const banCount = (existing?.banCount ?? 0) + 1;
  // Escalating duration: 1h → 24h → 7d
  const durationHours = banCount === 1 ? 1 : banCount <= 3 ? 24 : 7 * 24;
  const expiresAt = new Date(Date.now() + durationHours * 3600 * 1000);

  await db
    .insert(autoBansTable)
    .values({ targetType: type, targetValue: value, reason, trustScore, banCount, expiresAt })
    .onConflictDoNothing();
}

// ── Behavior analysis ────────────────────────────────────────────────────────
async function analyzeClaimBehavior(ctx: ClaimContext): Promise<{ penalties: string[]; score: number }> {
  const penalties: string[] = [];
  let delta = 0;

  const window1h  = new Date(Date.now() - 60 * 60 * 1000);
  const window24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Claims from same IP in last 1h
  const ipClaimsResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(claimsTable)
    .where(and(eq(claimsTable.ip, ctx.ip), gte(claimsTable.claimedAt, window1h)));
  const ipClaims = ipClaimsResult[0]?.count ?? 0;
  if (ipClaims > 8) {  // raised from 3 → 8 (CGNAT: many real users share one IP)
    delta += PENALTIES.MANY_CLAIMS_SAME_IP * Math.min(3, ipClaims - 8);
    penalties.push(`IP_CLAIM_FLOOD:${ipClaims}`);
  }

  // Different wallet addresses from same fingerprint in 24h
  if (ctx.fingerprint) {
    const fpWalletsResult = await db
      .select({ count: sql<number>`count(distinct address)::int` })
      .from(claimsTable)
      .where(
        and(
          eq(claimsTable.fingerprint, ctx.fingerprint),
          gte(claimsTable.claimedAt, window24h),
        )
      );
    const fpWallets = fpWalletsResult[0]?.count ?? 0;
    if (fpWallets > 4) {  // raised from 2 → 4 (family/friends share device)
      delta += PENALTIES.MANY_WALLETS_SAME_FP;
      penalties.push(`MULTI_WALLET_FP:${fpWallets}`);
    }

    // Last claim from same fingerprint (check timing)
    const [lastFpClaim] = await db
      .select({ claimedAt: claimsTable.claimedAt })
      .from(claimsTable)
      .where(eq(claimsTable.fingerprint, ctx.fingerprint))
      .orderBy(desc(claimsTable.claimedAt))
      .limit(1);
    if (lastFpClaim && (Date.now() - lastFpClaim.claimedAt.getTime()) < 5000) {
      delta += PENALTIES.RAPID_REQUESTS;
      penalties.push("RAPID_REQUESTS");
    }

    // Check if fingerprint is auto-banned
    const fpBanReason = await isAutoBanned("fingerprint", ctx.fingerprint);
    if (fpBanReason) {
      delta += PENALTIES.KNOWN_BAD_FP;
      penalties.push(`FP_BANNED:${fpBanReason}`);
    }
  } else {
    delta += PENALTIES.NO_FINGERPRINT;
    penalties.push("NO_FINGERPRINT");
  }

  // Prior claims from this address (established user bonus)
  const priorClaimsResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(claimsTable)
    .where(eq(claimsTable.address, ctx.address.toLowerCase()));
  const priorClaims = priorClaimsResult[0]?.count ?? 0;
  if (priorClaims > 3) {
    delta += BONUSES.ESTABLISHED;
  }

  return { penalties, score: delta };
}

// ── Reserve protection ───────────────────────────────────────────────────────
export async function checkReserveProtection(): Promise<void> {
  // Reserve protection is handled per-chain in the faucet route (WALLET_EMPTY error).
  // This is a placeholder for future auto-disable logic.
}

// ── Main evaluation ──────────────────────────────────────────────────────────
export async function evaluateClaim(ctx: ClaimContext): Promise<AbuseDecision> {
  const flags: string[] = [];
  let score = STARTING_SCORE;
  let sigVerified = false;

  // Load admin config (cached, ~60s TTL)
  const cfg = await getAntiAbuseConfig();

  // 0. Anti-abuse disabled globally
  if (!cfg.enabled) {
    return {
      allowed: true, trustScore: 100, flags: ["ABUSE_CHECK_DISABLED"],
      ipRep: { country: "Unknown", countryCode: "XX", isp: "", org: "", vpnDetected: false, proxyDetected: false, torDetected: false, datacenterDetected: false, reputationScore: 100 },
      country: "Unknown", vpnDetected: false, sigVerified: false,
    };
  }

  // 1. Check IP auto-ban
  const ipBanReason = await isAutoBanned("ip", ctx.ip);
  if (ipBanReason) {
    return {
      allowed: false, trustScore: 0, flags: [`IP_BANNED:${ipBanReason}`],
      reason: "Your IP has been temporarily blocked due to suspicious activity.",
      ipRep: { country: "Unknown", countryCode: "XX", isp: "", org: "", vpnDetected: false, proxyDetected: false, torDetected: false, datacenterDetected: false, reputationScore: 0 },
      country: "Unknown", vpnDetected: false, sigVerified: false,
    };
  }

  // 2. Check address auto-ban
  const addrBanReason = await isAutoBanned("address", ctx.address.toLowerCase());
  if (addrBanReason) {
    return {
      allowed: false, trustScore: 0, flags: [`ADDR_BANNED:${addrBanReason}`],
      reason: "This wallet address has been temporarily blocked due to suspicious activity.",
      ipRep: { country: "Unknown", countryCode: "XX", isp: "", org: "", vpnDetected: false, proxyDetected: false, torDetected: false, datacenterDetected: false, reputationScore: 0 },
      country: "Unknown", vpnDetected: false, sigVerified: false,
    };
  }

  // 3. IP reputation
  const ipRep = await getIpReputation(ctx.ip);

  // ── Hard blocks based on admin config ─────────────────────────────────────
  // These bypass the scoring system and immediately block the request.
  if (cfg.blockTor && ipRep.torDetected) {
    return {
      allowed: false, trustScore: 0, flags: ["TOR"],
      reason: "TOR exit node connections are not allowed on this faucet.",
      ipRep, country: ipRep.country, vpnDetected: ipRep.vpnDetected, sigVerified: false,
    };
  }
  if (cfg.blockProxy && ipRep.proxyDetected) {
    return {
      allowed: false, trustScore: 0, flags: ["PROXY"],
      reason: "Proxy connections are not allowed on this faucet.",
      ipRep, country: ipRep.country, vpnDetected: ipRep.vpnDetected, sigVerified: false,
    };
  }
  if (cfg.blockVpn && ipRep.vpnDetected) {
    return {
      allowed: false, trustScore: 0, flags: ["VPN"],
      reason: "VPN connections are not allowed on this faucet. Please disable your VPN and try again.",
      ipRep, country: ipRep.country, vpnDetected: true, sigVerified: false,
    };
  }
  if (cfg.blockDatacenter && ipRep.datacenterDetected) {
    return {
      allowed: false, trustScore: 0, flags: ["DATACENTER"],
      reason: "Datacenter / hosting IP addresses are not allowed on this faucet.",
      ipRep, country: ipRep.country, vpnDetected: false, sigVerified: false,
    };
  }
  // ──────────────────────────────────────────────────────────────────────────

  if (ipRep.torDetected)        { score += PENALTIES.TOR;        flags.push("TOR"); }
  if (ipRep.proxyDetected)      { score += PENALTIES.PROXY;      flags.push("PROXY"); }
  if (ipRep.vpnDetected)        { score += PENALTIES.VPN;        flags.push("VPN"); }
  if (ipRep.datacenterDetected) { score += PENALTIES.DATACENTER; flags.push("DATACENTER"); }

  // 4. Wallet signature (EVM only)
  if (ctx.signature && ctx.nonce && ctx.address.startsWith("0x")) {
    sigVerified = await verifyWalletSignature(ctx.address, ctx.nonce, ctx.signature);
    if (sigVerified) {
      score += BONUSES.SIG_VERIFIED;
      flags.push("SIG_OK");
    } else {
      flags.push("SIG_FAIL");
    }
  }

  // 5. Behavior analysis
  const { penalties: behaviorPenalties, score: behaviorDelta } = await analyzeClaimBehavior(ctx);
  score += behaviorDelta;
  flags.push(...behaviorPenalties);

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // 6. Auto-ban if score too low
  // Only ban IP when clearly abusive (score < BLOCK_SCORE).
  // Only ban fingerprint/address for extreme cases (score < 5) to avoid
  // collateral damage from CGNAT shared IPs or misclassified mobile ISPs.
  if (score < BLOCK_SCORE) {
    await applyAutoBan("ip", ctx.ip, flags.join(","), score);
    if (score < 5) {
      if (ctx.fingerprint) await applyAutoBan("fingerprint", ctx.fingerprint, flags.join(","), score);
      await applyAutoBan("address", ctx.address.toLowerCase(), flags.join(","), score);
    }
  }

  // 7. Log the attempt
  try {
    await db.insert(abuseLogsTable).values({
      address:     ctx.address.toLowerCase(),
      ip:          ctx.ip,
      fingerprint: ctx.fingerprint ?? null,
      userAgent:   ctx.userAgent   ?? null,
      timezone:    ctx.timezone    ?? null,
      country:     ipRep.country,
      isp:         ipRep.isp,
      vpnDetected: ipRep.vpnDetected,
      proxyDetected: ipRep.proxyDetected,
      torDetected:   ipRep.torDetected,
      datacenterDetected: ipRep.datacenterDetected,
      trustScore:  score,
      flags:       flags,
      action:      score < BLOCK_SCORE ? "blocked" : score < WARN_SCORE ? "flagged" : "allowed",
      chainId:     ctx.chainId,
    });
  } catch { /* non-critical */ }

  const allowed = score >= BLOCK_SCORE;
  return {
    allowed,
    trustScore: score,
    flags,
    reason: allowed ? undefined : buildBlockReason(flags, ipRep),
    ipRep,
    country:     ipRep.country,
    vpnDetected: ipRep.vpnDetected,
    sigVerified,
  };
}

function buildBlockReason(flags: string[], ipRep: IpRepResult): string {
  if (flags.includes("TOR"))    return "TOR exit node connections are not allowed on this faucet.";
  if (flags.includes("PROXY"))  return "Proxy connections are not allowed on this faucet.";
  if (flags.includes("VPN"))    return "VPN connections are not allowed on this faucet. Please disable your VPN and try again.";
  if (flags.includes("RAPID_REQUESTS")) return "Too many rapid requests detected. Please wait and try again.";
  if (flags.some(f => f.startsWith("MULTI_WALLET"))) return "Multiple wallet abuse detected. Your device has been temporarily restricted.";
  if (flags.some(f => f.startsWith("IP_CLAIM")))     return "Too many claims from your IP address. Please wait before trying again.";
  return "Suspicious activity detected. Your access has been temporarily restricted.";
}

// ── Admin helpers ─────────────────────────────────────────────────────────────
export async function getActiveBans(limit = 100) {
  return db
    .select()
    .from(autoBansTable)
    .where(gt(autoBansTable.expiresAt, new Date()))
    .orderBy(desc(autoBansTable.createdAt))
    .limit(limit);
}

export async function getRecentAbuseLogs(limit = 100) {
  return db
    .select()
    .from(abuseLogsTable)
    .orderBy(desc(abuseLogsTable.createdAt))
    .limit(limit);
}

export async function liftBan(id: number): Promise<void> {
  await db
    .update(autoBansTable)
    .set({ expiresAt: new Date(0) })
    .where(eq(autoBansTable.id, id));
}

export async function getSuspiciousLogs(limit = 100) {
  return db
    .select()
    .from(abuseLogsTable)
    .where(lt(abuseLogsTable.trustScore, WARN_SCORE))
    .orderBy(desc(abuseLogsTable.createdAt))
    .limit(limit);
}
