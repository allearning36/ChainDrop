import { Router, type IRouter, type Request } from "express";
import { desc, eq, and, gt, gte, sql } from "drizzle-orm";
import { db, claimsTable, chainsTable, blockedAddressesTable, ipBlocksTable, settingsTable, purchasesTable, adTokensTable, nonceTable } from "@workspace/db";
import { ClaimFaucetBody, GetFaucetStatusParams, RequestAdTokenBody, ClaimFaucetWithAdBody } from "@workspace/api-zod";
import { sendTokens, isValidAddress, type ChainType } from "../lib/chains/index";
import { parseRpcUrls } from "../lib/rpcFailover";
import { claimLimiter, checkWalletRateLimit } from "../lib/rateLimiters";
import { broadcast, broadcastError, classifyError, getErrorMeta } from "../lib/liveEvents";
import { resolveChainPrivateKey } from "../lib/encryption";
import { creditCommissions, getReferralSettings } from "../lib/referral";
import { evaluateClaim, verifyWalletSignature } from "../lib/antiAbuse";

function getClientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "unknown";
}

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;

async function verifyCaptcha(token: string): Promise<boolean> {
  if (!RECAPTCHA_SECRET) return false;
  if (!token) return false;
  try {
    const res = await fetch(
      `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET}&response=${encodeURIComponent(token)}`,
      { method: "POST" }
    );
    const data = await res.json() as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

const router: IRouter = Router();

router.post("/faucet/claim", claimLimiter, async (req, res): Promise<void> => {
  const parsed = ClaimFaucetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { chainId, address, captchaToken } = parsed.data;
  const clientIp = getClientIp(req);

  // ── Per-wallet rate limit (independent of IP) ─────────────────────────────
  const walletCheck = checkWalletRateLimit(address);
  if (!walletCheck.allowed) {
    const retryMins = Math.ceil(walletCheck.retryAfterMs / 60000);
    res.status(429).json({ error: `You have reached the claim limit for this wallet. You can claim again in ${retryMins} minute(s).` });
    return;
  }

  // Check maintenance mode
  try {
    const [maintenanceSetting] = await db.select().from(settingsTable).where(eq(settingsTable.key, "maintenanceMode")).limit(1);
    if (maintenanceSetting?.value) {
      try {
        const mc = JSON.parse(maintenanceSetting.value) as { enabled?: boolean; message?: string };
        if (mc.enabled) {
          res.status(503).json({ error: mc.message || "The faucet is currently under maintenance. Please check back soon." });
          return;
        }
      } catch { /* ignore parse error */ }
    }
  } catch (err) {
    req.log.warn({ err }, "Maintenance check failed — continuing");
  }

  // Check IP block
  try {
    const [blockedIp] = await db.select().from(ipBlocksTable).where(eq(ipBlocksTable.ip, clientIp)).limit(1);
    if (blockedIp) {
      broadcast({ type: "claim_error", chainId, address, ip: clientIp, error: "IP blocked", rootCause: "ADDRESS_BLOCKED", detail: "IP address is blocked" });
      res.status(403).json({ error: "Your IP address has been blocked from using the faucet." });
      return;
    }
  } catch (err) {
    req.log.warn({ err }, "IP block check failed — continuing");
  }

  // ── IP rolling-window claim limit ─────────────────────────────────────────
  // Admin sets: windowHours (e.g. 1) + maxClaimsPerWindow (e.g. 2).
  // We count how many successful claims this IP made in the last windowHours.
  // If at or over the limit → deny (user can bypass by watching an ad).
  try {
    const [configRow] = await db
      .select().from(settingsTable).where(eq(settingsTable.key, "ipClaimConfig")).limit(1);
    const config = configRow?.value
      ? (JSON.parse(configRow.value) as { enabled?: boolean; windowHours?: number; maxClaimsPerWindow?: number })
      : {};

    if (config.enabled) {
      const windowHours        = typeof config.windowHours        === "number" ? config.windowHours        : 24;
      const maxClaimsPerWindow = typeof config.maxClaimsPerWindow === "number" ? config.maxClaimsPerWindow : 2;

      const windowStart = new Date(Date.now() - windowHours * 3600 * 1000);
      const [ipCountResult] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(claimsTable)
        .where(and(eq(claimsTable.ip, clientIp), gte(claimsTable.claimedAt, windowStart)));
      const ipCount = ipCountResult?.n ?? 0;

      if (ipCount >= maxClaimsPerWindow) {
        const [oldestInWindow] = await db
          .select({ claimedAt: claimsTable.claimedAt })
          .from(claimsTable)
          .where(and(eq(claimsTable.ip, clientIp), gte(claimsTable.claimedAt, windowStart)))
          .orderBy(claimsTable.claimedAt)
          .limit(1);
        const nextFreeAt  = oldestInWindow
          ? new Date(oldestInWindow.claimedAt.getTime() + windowHours * 3600 * 1000)
          : new Date(Date.now() + windowHours * 3600 * 1000);
        const remainMs    = nextFreeAt.getTime() - Date.now();
        const remainH     = Math.floor(remainMs / 3600000);
        const remainM     = Math.floor((remainMs % 3600000) / 60000);
        const timeStr     = remainH > 0 ? `${remainH}h ${remainM}m` : `${remainM}m`;
        const windowLabel = windowHours < 24
          ? `${windowHours}h window`
          : windowHours === 24 ? "day" : `${windowHours / 24}-day window`;
        res.status(429).json({
          error: `IP limit reached: ${maxClaimsPerWindow} claim${maxClaimsPerWindow !== 1 ? "s" : ""} per ${windowLabel}. Next free slot in ${timeStr}. Watch an ad to keep claiming.`,
          ipLimitReached: true,
          nextFreeAt: nextFreeAt.toISOString(),
        });
        return;
      }
    }
  } catch (err) {
    req.log.warn({ err }, "IP window limit check failed — continuing");
  }

  // ── Anti-abuse evaluation ──────────────────────────────────────────────────
  const { fingerprint, signature, nonce, timezone } = parsed.data;
  const userAgent = req.headers["user-agent"] ?? undefined;

  // Validate nonce for wallet signature (EVM only, optional but boosts trust)
  let validatedNonce: string | undefined;
  try {
    if (signature && nonce && address.startsWith("0x")) {
      const [nonceRow] = await db
        .select()
        .from(nonceTable)
        .where(and(eq(nonceTable.address, address.toLowerCase()), eq(nonceTable.nonce, nonce)))
        .limit(1);
      if (nonceRow && !nonceRow.usedAt && nonceRow.expiresAt > new Date()) {
        validatedNonce = nonce;
        await db.update(nonceTable).set({ usedAt: new Date() }).where(eq(nonceTable.id, nonceRow.id));
      }
    }
  } catch (err) {
    req.log.warn({ err }, "Nonce validation failed — skipping");
  }

  // Fail-safe: if anti-abuse evaluation throws for any reason, allow the claim
  let abuseResult: Awaited<ReturnType<typeof evaluateClaim>>;
  try {
    abuseResult = await evaluateClaim({
      address,
      ip: clientIp,
      fingerprint: fingerprint ?? undefined,
      userAgent,
      timezone:    timezone ?? undefined,
      chainId,
      signature:   validatedNonce ? (signature ?? undefined) : undefined,
      nonce:       validatedNonce,
    });
  } catch (err) {
    req.log.error({ err }, "Anti-abuse evaluation failed — allowing claim (fail-safe)");
    abuseResult = {
      allowed: true,
      trustScore: 50,
      flags: ["EVAL_ERROR"],
      country: "Unknown",
      vpnDetected: false,
      sigVerified: false,
      ipRep: { country: "Unknown", countryCode: "XX", isp: "", org: "", vpnDetected: false, proxyDetected: false, torDetected: false, datacenterDetected: false, reputationScore: 100 },
    };
  }

  if (!abuseResult.allowed) {
    broadcast({ type: "claim_error", chainId, address, ip: clientIp, error: "Anti-abuse block", rootCause: "ADDRESS_BLOCKED", detail: abuseResult.flags.join(",") });
    res.status(403).json({ error: abuseResult.reason ?? "Request blocked by anti-abuse system." });
    return;
  }

  // Fetch chain
  let chain: typeof chainsTable.$inferSelect | undefined;
  try {
    const rows = await db
      .select()
      .from(chainsTable)
      .where(and(eq(chainsTable.id, chainId), eq(chainsTable.isEnabled, true)));
    chain = rows[0];
  } catch (err) {
    req.log.error({ err }, "Chain fetch failed");
    res.status(503).json({ error: "Could not load chain data. Please try again." });
    return;
  }

  if (!chain) {
    res.status(404).json({ error: "Chain not found or disabled" });
    return;
  }

  // CAPTCHA verification — only if this chain has captchaEnabled (default: true)
  if (chain.captchaEnabled !== false) {
    const captchaValid = await verifyCaptcha(captchaToken ?? "");
    if (!captchaValid) {
      broadcast({ type: "claim_error", chainId, address, ip: clientIp, error: "CAPTCHA failed", rootCause: "CAPTCHA_FAILED", detail: "reCAPTCHA verification failed" });
      res.status(400).json({ error: "CAPTCHA verification failed. Please try again." });
      return;
    }
  }

  if (chain.availableStatus === "NO") {
    res.status(429).json({ error: "This faucet is currently unavailable" });
    return;
  }

  const chainType = chain.chainType as ChainType;
  let addressValid: boolean;
  try {
    addressValid = await isValidAddress(chainType, address, chain.addressRegex);
  } catch (err) {
    req.log.warn({ err }, "isValidAddress threw — treating as invalid");
    res.status(400).json({ error: `Invalid ${chain.name} address format` });
    return;
  }
  if (!addressValid) {
    res.status(400).json({ error: `Invalid ${chain.name} address format` });
    return;
  }

  // Check if address is blocked
  try {
    const [blocked] = await db
      .select()
      .from(blockedAddressesTable)
      .where(eq(blockedAddressesTable.address, address.toLowerCase()))
      .limit(1);
    if (blocked) {
      broadcast({ type: "claim_error", chainId, chainName: chain.name, address, ip: clientIp, error: "Address blocked", rootCause: "ADDRESS_BLOCKED", detail: "Wallet address is blocked" });
      res.status(403).json({ error: "This address has been blocked from using the faucet." });
      return;
    }
  } catch (err) {
    req.log.warn({ err }, "Address block check failed — continuing");
  }

  const cooldownMs = chain.cooldownSeconds * 1000;
  const since = new Date(Date.now() - cooldownMs);

  try {
    const [recent] = await db
      .select()
      .from(claimsTable)
      .where(and(eq(claimsTable.chainId, chainId), eq(claimsTable.address, address.toLowerCase())))
      .orderBy(desc(claimsTable.claimedAt))
      .limit(1);

    if (recent && recent.claimedAt > since) {
      const nextClaimAt = new Date(recent.claimedAt.getTime() + cooldownMs);
      res.status(429).json({ error: `Already claimed. Next claim at ${nextClaimAt.toISOString()}` });
      return;
    }
  } catch (err) {
    req.log.warn({ err }, "Cooldown check failed — continuing");
  }

  let txHash: string;
  try {
    const result = await sendTokens(chainType, parseRpcUrls(chain.rpcUrls, chain.rpcUrl), resolveChainPrivateKey(chain.privateKey), address, chain.claimAmount, { gasPriceGwei: chain.gasPriceGwei, gasLimit: chain.gasLimit });
    txHash = result.txHash;
  } catch (err) {
    req.log.error({ err }, "Failed to send tokens");
    broadcastError("claim_error", err, {
      chainId,
      chainName: chain.name,
      address,
      ip: clientIp,
      amount: chain.claimAmount,
      symbol: chain.symbol,
    });

    const cause = classifyError(err);
    const { detail } = getErrorMeta(cause);

    const userMessages: Record<string, { status: number; msg: string }> = {
      RPC_DISCONNECTED:      { status: 503, msg: "Network connection dropped. Please try again in a moment." },
      RPC_REFUSED:           { status: 503, msg: "Could not reach the network. The RPC node may be down." },
      RPC_INVALID_URL:       { status: 503, msg: "Could not reach the network. The RPC node may be down." },
      RPC_TIMEOUT:           { status: 503, msg: "Network request timed out. Please try again." },
      RPC_UNREACHABLE:       { status: 503, msg: "Could not reach the network. Please try again later." },
      RPC_WRONG_NETWORK:     { status: 503, msg: "RPC network mismatch. Please try again later." },
      RPC_BAD_RESPONSE:      { status: 503, msg: "Received an invalid response from the network. Please try again." },
      WALLET_EMPTY:          { status: 503, msg: "The faucet is temporarily out of funds. Please try again later." },
      WALLET_GAS_LOW:        { status: 503, msg: "The faucet wallet has enough tokens but cannot cover the gas fee for this transaction. Please contact the admin to adjust the gas price setting." },
      NONCE_CONFLICT:        { status: 503, msg: "Transaction conflict — please wait a moment and try again." },
      TX_UNDERPRICED:        { status: 503, msg: "Gas price too low for current network conditions. Please try again." },
      TX_REVERTED:           { status: 500, msg: "Transaction was rejected by the network. Please try again." },
      GAS_ESTIMATION_FAILED: { status: 503, msg: "Could not estimate gas. Please try again later." },
      GAS_TOO_LOW:           { status: 503, msg: "Network is congested. Please try again in a moment." },
      BAD_PRIVATE_KEY:       { status: 500, msg: "Faucet configuration error. Please contact support." },
    };

    req.log.error({ err, cause, detail }, "Failed to send tokens — classified error");

    const entry = userMessages[cause];
    if (entry) {
      res.status(entry.status).json({ error: entry.msg });
    } else {
      res.status(500).json({ error: "Transaction failed. Please try again later." });
    }
    return;
  }

  // Insert claim — try with anti-abuse fields, fallback to core fields only
  let claim: typeof claimsTable.$inferSelect;
  try {
    const [inserted] = await db
      .insert(claimsTable)
      .values({
        chainId,
        address:     address.toLowerCase(),
        txHash,
        amount:      chain.claimAmount,
        ip:          clientIp,
        fingerprint: fingerprint ?? null,
        userAgent:   userAgent ?? null,
        country:     abuseResult.country ?? null,
        timezone:    timezone ?? null,
        vpnDetected: abuseResult.vpnDetected,
        trustScore:  abuseResult.trustScore,
        sigVerified: abuseResult.sigVerified,
      })
      .returning();
    claim = inserted!;
  } catch (err) {
    req.log.warn({ err }, "Claim insert with anti-abuse fields failed — retrying with core fields only");
    try {
      // Use explicit RETURNING with only core columns so this works even if
      // the production DB hasn't run the anti-abuse schema migration yet.
      const [inserted] = await db
        .insert(claimsTable)
        .values({
          chainId,
          address: address.toLowerCase(),
          txHash,
          amount:  chain.claimAmount,
        })
        .returning({
          id:        claimsTable.id,
          chainId:   claimsTable.chainId,
          address:   claimsTable.address,
          txHash:    claimsTable.txHash,
          amount:    claimsTable.amount,
          claimedAt: claimsTable.claimedAt,
        });
      // Merge with TypeScript-level defaults for anti-abuse fields (may be absent in older DB)
      claim = {
        ...inserted!,
        ip:          null,
        fingerprint: null,
        userAgent:   null,
        country:     null,
        timezone:    null,
        vpnDetected: false,
        trustScore:  50,
        sigVerified: false,
      };
    } catch (err2) {
      req.log.error({ err2 }, "Fallback claim insert also failed — tokens were sent but claim not recorded");
      broadcastError("server_error", err2, { chainId, chainName: chain.name, address, ip: clientIp });
      res.status(500).json({ error: "Tokens sent but record failed. Please contact support with your tx hash." });
      return;
    }
  }

  broadcast({
    type: "claim_success",
    chainId,
    chainName: chain.name,
    address: claim.address,
    txHash: claim.txHash,
    amount: claim.amount,
    symbol: chain.symbol,
    ip: clientIp,
  });

  // Referral commission (fire-and-forget)
  void getReferralSettings().then(async settings => {
    await creditCommissions({
      refereeAddress: address,
      sourceType: "faucet_claim",
      sourceId: claim.id,
      chainId,
      amountEth: chain.claimAmount,
      fromCoingeckoId: chain.coingeckoId ?? null,
      settings,
    });
  }).catch(() => {/* non-critical */});

  res.json({
    txHash: claim.txHash,
    address: claim.address,
    amount: claim.amount,
    symbol: chain.symbol,
    chainName: chain.name,
    claimedAt: claim.claimedAt.toISOString(),
  });
});

router.get("/faucet/status/:chainId/:address", async (req, res): Promise<void> => {
  const rawChainId = Array.isArray(req.params.chainId) ? req.params.chainId[0] : req.params.chainId;
  const rawAddress = Array.isArray(req.params.address) ? req.params.address[0] : req.params.address;

  const params = GetFaucetStatusParams.safeParse({ chainId: rawChainId, address: rawAddress });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { chainId, address } = params.data;

  const [chain] = await db.select().from(chainsTable).where(eq(chainsTable.id, chainId));
  if (!chain) {
    res.status(404).json({ error: "Chain not found" });
    return;
  }

  const chainType = chain.chainType as ChainType;
  let addressValid: boolean;
  try {
    addressValid = await isValidAddress(chainType, address, chain.addressRegex);
  } catch {
    addressValid = false;
  }
  if (!addressValid) {
    res.status(400).json({ error: `Invalid ${chain.name} address format` });
    return;
  }

  const cooldownMs = chain.cooldownSeconds * 1000;
  const since = new Date(Date.now() - cooldownMs);

  const [recent] = await db
    .select()
    .from(claimsTable)
    .where(and(eq(claimsTable.chainId, chainId), eq(claimsTable.address, address.toLowerCase())))
    .orderBy(desc(claimsTable.claimedAt))
    .limit(1);

  if (!recent || recent.claimedAt <= since) {
    res.json({ chainId, address: address.toLowerCase(), canClaim: true, nextClaimAt: null, lastClaimedAt: recent?.claimedAt.toISOString() ?? null });
    return;
  }

  const nextClaimAt = new Date(recent.claimedAt.getTime() + cooldownMs);
  res.json({ chainId, address: address.toLowerCase(), canClaim: false, nextClaimAt: nextClaimAt.toISOString(), lastClaimedAt: recent.claimedAt.toISOString(), lastTxHash: recent.txHash ?? null });
});

router.get("/faucet/history", async (_req, res): Promise<void> => {
  const [claims, purchases] = await Promise.all([
    db.select({
      id: claimsTable.id,
      chainId: claimsTable.chainId,
      chainName: chainsTable.name,
      symbol: chainsTable.symbol,
      logoUrl: chainsTable.logoUrl,
      explorerUrl: chainsTable.explorerUrl,
      address: claimsTable.address,
      txHash: claimsTable.txHash,
      amount: claimsTable.amount,
      claimedAt: claimsTable.claimedAt,
    })
    .from(claimsTable)
    .innerJoin(chainsTable, eq(claimsTable.chainId, chainsTable.id))
    .orderBy(desc(claimsTable.claimedAt))
    .limit(150),

    db.select({
      id: purchasesTable.id,
      chainId: purchasesTable.chainId,
      chainName: chainsTable.name,
      symbol: chainsTable.symbol,
      logoUrl: chainsTable.logoUrl,
      explorerUrl: chainsTable.explorerUrl,
      address: purchasesTable.userAddress,
      txHash: purchasesTable.testnetTxHash,
      amount: purchasesTable.testnetAmountSent,
      claimedAt: purchasesTable.createdAt,
    })
    .from(purchasesTable)
    .innerJoin(chainsTable, eq(purchasesTable.chainId, chainsTable.id))
    .where(eq(purchasesTable.status, "completed"))
    .orderBy(desc(purchasesTable.createdAt))
    .limit(150),
  ]);

  const combined = [
    ...claims.map((c) => ({
      id: c.id, chainId: c.chainId, chainName: c.chainName, symbol: c.symbol,
      logoUrl: c.logoUrl ?? null, explorerUrl: c.explorerUrl ?? null,
      address: c.address, txHash: c.txHash,
      amount: c.amount, claimedAt: c.claimedAt.toISOString(), type: "claim" as const,
    })),
    ...purchases
      .filter((p) => p.txHash && p.amount)
      .map((p) => ({
        id: p.id, chainId: p.chainId, chainName: p.chainName, symbol: p.symbol,
        logoUrl: p.logoUrl ?? null, explorerUrl: p.explorerUrl ?? null,
        address: p.address, txHash: p.txHash!,
        amount: p.amount!, claimedAt: p.claimedAt.toISOString(), type: "buy" as const,
      })),
  ]
    .sort((a, b) => new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime());

  res.json(combined);
});

router.post("/faucet/ad-token", async (req, res): Promise<void> => {
  const parsed = RequestAdTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { chainId, address } = parsed.data;

  const [chain] = await db
    .select()
    .from(chainsTable)
    .where(and(eq(chainsTable.id, chainId), eq(chainsTable.isEnabled, true)));

  if (!chain) {
    res.status(404).json({ error: "Chain not found or disabled" });
    return;
  }
  if (!chain.adClaimEnabled) {
    res.status(400).json({ error: "Ad claims are not enabled for this chain" });
    return;
  }

  const chainType = chain.chainType as ChainType;
  let addressValid: boolean;
  try {
    addressValid = await isValidAddress(chainType, address, chain.addressRegex);
  } catch {
    addressValid = false;
  }
  if (!addressValid) {
    res.status(400).json({ error: `Invalid ${chain.name} address format` });
    return;
  }

  // Enforce ad cooldown if configured
  if (chain.adCooldownSeconds > 0) {
    const since = new Date(Date.now() - chain.adCooldownSeconds * 1000);
    const [recentToken] = await db
      .select()
      .from(adTokensTable)
      .where(and(
        eq(adTokensTable.chainId, chainId),
        eq(adTokensTable.address, address.toLowerCase()),
        gt(adTokensTable.issuedAt, since),
      ))
      .limit(1);
    if (recentToken) {
      const waitMs = recentToken.issuedAt.getTime() + chain.adCooldownSeconds * 1000 - Date.now();
      const waitSecs = Math.max(1, Math.ceil(waitMs / 1000));
      const h = Math.floor(waitSecs / 3600);
      const m = Math.floor((waitSecs % 3600) / 60);
      const s = waitSecs % 60;
      const timeStr = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
      res.status(429).json({ error: `Ad cooldown active. Wait ${timeStr} before watching another ad.` });
      return;
    }
  }

  const token = crypto.randomUUID();
  const now = new Date();
  const durationSeconds = chain.adDurationSeconds;
  const validAfter = new Date(now.getTime() + durationSeconds * 1000);
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

  await db.insert(adTokensTable).values({
    chainId,
    address: address.toLowerCase(),
    token,
    validAfter,
    expiresAt,
  });

  res.json({ token, durationSeconds, adContent: chain.adNetworkCode ?? null });
});

router.post("/faucet/ad-claim", claimLimiter, async (req, res): Promise<void> => {
  const parsed = ClaimFaucetWithAdBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { token, chainId, address } = parsed.data;
  const clientIp = getClientIp(req);

  const [adToken] = await db
    .select()
    .from(adTokensTable)
    .where(eq(adTokensTable.token, token))
    .limit(1);

  if (!adToken) {
    res.status(400).json({ error: "Invalid ad token" });
    return;
  }
  if (adToken.usedAt) {
    res.status(400).json({ error: "This ad token has already been used" });
    return;
  }
  if (adToken.chainId !== chainId) {
    res.status(400).json({ error: "Token chain mismatch" });
    return;
  }
  if (adToken.address !== address.toLowerCase()) {
    res.status(400).json({ error: "Token address mismatch" });
    return;
  }

  const now = new Date();
  if (now < adToken.validAfter) {
    const remaining = Math.ceil((adToken.validAfter.getTime() - now.getTime()) / 1000);
    res.status(400).json({ error: `Ad not complete yet. Please wait ${remaining} more second(s).` });
    return;
  }
  if (now > adToken.expiresAt) {
    res.status(400).json({ error: "Ad token has expired. Please watch the ad again." });
    return;
  }

  const [chain] = await db
    .select()
    .from(chainsTable)
    .where(and(eq(chainsTable.id, chainId), eq(chainsTable.isEnabled, true)));

  if (!chain || !chain.adClaimEnabled) {
    res.status(404).json({ error: "Chain not found or ad claims disabled" });
    return;
  }

  const [blockedIp] = await db.select().from(ipBlocksTable).where(eq(ipBlocksTable.ip, clientIp)).limit(1);
  if (blockedIp) {
    res.status(403).json({ error: "Your IP address has been blocked from using the faucet." });
    return;
  }

  const [blocked] = await db
    .select()
    .from(blockedAddressesTable)
    .where(eq(blockedAddressesTable.address, address.toLowerCase()))
    .limit(1);
  if (blocked) {
    res.status(403).json({ error: "This address has been blocked from using the faucet." });
    return;
  }

  await db.update(adTokensTable).set({ usedAt: now }).where(eq(adTokensTable.token, token));

  const claimAmount = chain.adClaimAmount ?? chain.claimAmount;
  const chainType = chain.chainType as ChainType;

  let txHash: string;
  try {
    const result = await sendTokens(
      chainType,
      parseRpcUrls(chain.rpcUrls, chain.rpcUrl),
      resolveChainPrivateKey(chain.privateKey),
      address,
      claimAmount,
      { gasPriceGwei: chain.gasPriceGwei, gasLimit: chain.gasLimit }
    );
    txHash = result.txHash;
  } catch (err) {
    await db.update(adTokensTable).set({ usedAt: null }).where(eq(adTokensTable.token, token));
    req.log.error({ err }, "Failed to send tokens for ad claim");
    res.status(500).json({ error: "Transaction failed. Please try again later." });
    return;
  }

  const [claim] = await db
    .insert(claimsTable)
    .values({
      chainId,
      address:   address.toLowerCase(),
      txHash,
      amount:    claimAmount,
      ip:        clientIp,
      userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
    })
    .returning();

  broadcast({
    type: "claim_success",
    chainId,
    chainName: chain.name,
    address: address.toLowerCase(),
    txHash,
    amount: claimAmount,
    symbol: chain.symbol,
    ip: clientIp,
  });

  // Referral commission (fire-and-forget)
  void getReferralSettings().then(async settings => {
    await creditCommissions({
      refereeAddress: address,
      sourceType: "faucet_claim",
      sourceId: claim.id,
      chainId,
      amountEth: claimAmount,
      fromCoingeckoId: chain.coingeckoId ?? null,
      settings,
    });
  }).catch(() => {/* non-critical */});

  res.json({
    txHash,
    address: address.toLowerCase(),
    amount: claimAmount,
    symbol: chain.symbol,
    chainName: chain.name,
    claimedAt: claim.claimedAt.toISOString(),
  });
});

export default router;
