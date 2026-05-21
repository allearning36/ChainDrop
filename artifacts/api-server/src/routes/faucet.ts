import { Router, type IRouter, type Request } from "express";
import { desc, eq, and } from "drizzle-orm";
import { db, claimsTable, chainsTable, blockedAddressesTable, ipBlocksTable, settingsTable, purchasesTable } from "@workspace/db";
import { ClaimFaucetBody, GetFaucetStatusParams } from "@workspace/api-zod";
import { sendTokens, isValidAddress, type ChainType } from "../lib/chains/index";
import { parseRpcUrls } from "../lib/rpcFailover";
import { claimLimiter } from "../lib/rateLimiters";
import { broadcast, broadcastError, classifyError, getErrorMeta } from "../lib/liveEvents";

function getClientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "unknown";
}

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;

async function verifyCaptcha(token: string): Promise<boolean> {
  if (!RECAPTCHA_SECRET) return true;
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

  // CAPTCHA verification
  const captchaValid = await verifyCaptcha(captchaToken ?? "");
  if (!captchaValid) {
    broadcast({ type: "claim_error", chainId, address, ip: clientIp, error: "CAPTCHA failed", rootCause: "CAPTCHA_FAILED", detail: "reCAPTCHA verification failed" });
    res.status(400).json({ error: "CAPTCHA verification failed. Please try again." });
    return;
  }

  // Check maintenance mode
  const [maintenanceSetting] = await db.select().from(settingsTable).where(eq(settingsTable.key, "maintenanceMode")).limit(1);
  if (maintenanceSetting?.value) {
    try {
      const mc = JSON.parse(maintenanceSetting.value) as { enabled?: boolean; message?: string };
      if (mc.enabled) {
        res.status(503).json({ error: mc.message || "The faucet is currently under maintenance. Please check back soon." });
        return;
      }
    } catch { /* ignore */ }
  }

  // Check IP block
  const [blockedIp] = await db.select().from(ipBlocksTable).where(eq(ipBlocksTable.ip, clientIp)).limit(1);
  if (blockedIp) {
    broadcast({ type: "claim_error", chainId, address, ip: clientIp, error: "IP blocked", rootCause: "ADDRESS_BLOCKED", detail: "IP address is blocked" });
    res.status(403).json({ error: "Your IP address has been blocked from using the faucet." });
    return;
  }

  // Fetch chain
  const [chain] = await db
    .select()
    .from(chainsTable)
    .where(and(eq(chainsTable.id, chainId), eq(chainsTable.isEnabled, true)));

  if (!chain) {
    res.status(404).json({ error: "Chain not found or disabled" });
    return;
  }

  if (chain.availableStatus === "NO") {
    res.status(429).json({ error: "This faucet is currently unavailable" });
    return;
  }

  const chainType = chain.chainType as ChainType;
  const addressValid = await isValidAddress(chainType, address);
  if (!addressValid) {
    res.status(400).json({ error: `Invalid ${chain.name} address format` });
    return;
  }

  // Check if address is blocked
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

  const cooldownMs = chain.cooldownSeconds * 1000;
  const since = new Date(Date.now() - cooldownMs);

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

  let txHash: string;
  try {
    const result = await sendTokens(chainType, parseRpcUrls(chain.rpcUrls, chain.rpcUrl), chain.privateKey, address, chain.claimAmount, { gasPriceGwei: chain.gasPriceGwei });
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

  const [claim] = await db
    .insert(claimsTable)
    .values({ chainId, address: address.toLowerCase(), txHash, amount: chain.claimAmount })
    .returning();

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
  const addressValid = await isValidAddress(chainType, address);
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
  res.json({ chainId, address: address.toLowerCase(), canClaim: false, nextClaimAt: nextClaimAt.toISOString(), lastClaimedAt: recent.claimedAt.toISOString() });
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
    .sort((a, b) => new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime())
    .slice(0, 20);

  res.json(combined);
});

export default router;
