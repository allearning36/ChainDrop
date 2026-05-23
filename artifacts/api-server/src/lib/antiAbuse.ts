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

const BLOCK_SCORE     = 15;   // trust < this → block
const WARN_SCORE      = 35;   // trust < this → log warning
const STARTING_SCORE  = 50;

// ── Trust score adjustments ─────────────────────────────────────────────────
const PENALTIES = {
  TOR:           -50,
  PROXY:         -35,
  VPN:           -30,
  DATACENTER:    -20,
  MANY_WALLETS_SAME_FP:  -20, // >2 wallets from same fingerprint in 24h
  MANY_CLAIMS_SAME_IP:   -15, // >3 claims from same IP in 1h
  RAPID_REQUESTS:        -30, // <5s between requests from same fingerprint
  NO_FINGERPRINT:        -10,
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
  if (ipClaims > 3) {
    delta += PENALTIES.MANY_CLAIMS_SAME_IP * Math.min(3, ipClaims - 3);
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
    if (fpWallets > 2) {
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
  if (score < BLOCK_SCORE) {
    if (ctx.fingerprint) await applyAutoBan("fingerprint", ctx.fingerprint, flags.join(","), score);
    await applyAutoBan("ip", ctx.ip, flags.join(","), score);
    if (score < 5) await applyAutoBan("address", ctx.address.toLowerCase(), flags.join(","), score);
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
