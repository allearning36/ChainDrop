import { Router, type IRouter } from "express";
import { ethers } from "ethers";
import { db, chainsTable, purchasesTable, paymentNetworksTable } from "@workspace/db";
import { eq, and, desc, isNull, lt, or, lte } from "drizzle-orm";
import { GetBuyInfoParams, SubmitBuyBody } from "@workspace/api-zod";
import { sendTokens as sendChainTokens, isValidAddress, type ChainType } from "../lib/chains/index";
import { parseRpcUrls } from "../lib/rpcFailover";
import { buyLimiter } from "../lib/rateLimiters";
import { resolveChainPrivateKey, resolveChainWalletAddress } from "../lib/encryption";
import { creditCommissions, getReferralSettings } from "../lib/referral";
import { broadcast } from "../lib/liveEvents";
import { logOrderEvent } from "../lib/orderEvents";
import { checkRpcHealth } from "../lib/rpcFailover";
import { getWalletBalance, deriveWalletAddress } from "../lib/chains/index";

const router: IRouter = Router();

const MAX_BUY_RETRIES = 3;
const BUY_BACKOFF_MINUTES = [2, 8, 32];

function buyNextRetryAt(retryCount: number): Date {
  const minutes = BUY_BACKOFF_MINUTES[retryCount] ?? 60;
  return new Date(Date.now() + minutes * 60 * 1000);
}

async function getAllPaymentNetworks(): Promise<Record<string, { name: string; symbol: string; chainId: number; rpcUrl: string; logoUrl: string | null }>> {
  const networks = await db.select().from(paymentNetworksTable).where(eq(paymentNetworksTable.isEnabled, true));
  const result: Record<string, { name: string; symbol: string; chainId: number; rpcUrl: string; logoUrl: string | null }> = {};
  for (const n of networks) {
    result[n.networkId] = { name: n.name, symbol: n.symbol, chainId: n.chainId, rpcUrl: n.rpcUrl, logoUrl: n.logoUrl ?? null };
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /faucet/buy/preflight/:chainId — pre-flight health check
// Frontend calls this before showing the pay button to detect problems early.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/faucet/buy/preflight/:chainId", async (req, res): Promise<void> => {
  const chainId = parseInt(String(req.params.chainId));
  if (isNaN(chainId)) { res.status(400).json({ ok: false, reason: "Invalid chainId" }); return; }

  const [chain] = await db.select().from(chainsTable).where(and(eq(chainsTable.id, chainId), eq(chainsTable.isEnabled, true))).limit(1);
  if (!chain || !chain.buyEnabled) {
    res.json({ ok: false, reason: "Chain not available for buy" });
    return;
  }

  // DB health — verify purchases table is accessible before user sends funds
  try {
    await db.select({ id: purchasesTable.id }).from(purchasesTable).limit(1);
  } catch (dbErr: any) {
    req.log.error({ err: dbErr }, "Preflight: purchases table not accessible — DB migration may be needed");
    res.json({ ok: false, reason: "Service is under maintenance. Please try again in a few minutes." });
    return;
  }

  const rpcUrls = parseRpcUrls(chain.rpcUrls, chain.rpcUrl);
  const checks: Record<string, boolean> = {
    chainEnabled: true,
    dbHealthy: true,
    rpcHealthy: false,
    walletSufficient: false,
  };

  // RPC health
  try {
    const health = await checkRpcHealth(rpcUrls[0]!);
    checks.rpcHealthy = health.status === "ok";
  } catch { checks.rpcHealthy = false; }

  if (!checks.rpcHealthy) {
    res.json({ ok: false, reason: `Destination chain RPC unavailable (${chain.name})`, checks });
    return;
  }

  // Wallet balance
  try {
    const walletAddr = resolveChainWalletAddress(chain.walletAddress);
    const balance = await getWalletBalance(chain.chainType as ChainType, rpcUrls, walletAddr);
    const minPay = parseFloat(chain.buyMinAmount) * parseFloat(chain.buyRate || "1");
    checks.walletSufficient = balance !== null && parseFloat(balance) >= minPay;
  } catch { checks.walletSufficient = false; }

  if (!checks.walletSufficient) {
    res.json({ ok: false, reason: `Faucet wallet is low on ${chain.name} funds`, checks });
    return;
  }

  res.json({ ok: true, reason: null, checks });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /faucet/buy/info/:chainId
// ─────────────────────────────────────────────────────────────────────────────
router.get("/faucet/buy/info/:chainId", async (req, res): Promise<void> => {
  const params = GetBuyInfoParams.safeParse({ chainId: req.params.chainId });
  if (!params.success) {
    res.status(400).json({ error: "Invalid chainId" });
    return;
  }

  const [chain] = await db
    .select()
    .from(chainsTable)
    .where(and(eq(chainsTable.id, params.data.chainId), eq(chainsTable.isEnabled, true)));

  if (!chain || !chain.buyEnabled) {
    res.status(404).json({ error: "Chain not found or buy not enabled" });
    return;
  }

  const receiveAddress = chain.receiveAddress || chain.walletAddress;
  let enabledNetworkIds: string[] = ["eth"];
  try {
    enabledNetworkIds = JSON.parse(chain.buyCurrencies);
  } catch {
    enabledNetworkIds = ["eth"];
  }

  const allNetworks = await getAllPaymentNetworks();
  const networks = enabledNetworkIds
    .filter((id) => allNetworks[id])
    .map((id) => ({ id, ...allNetworks[id] }));

  let buyRatesMap: Record<string, string> = {};
  try { buyRatesMap = JSON.parse(chain.buyRates || "{}"); } catch { /* keep empty */ }
  let buyLimitsMap: Record<string, { min?: string; max?: string }> = {};
  try { buyLimitsMap = JSON.parse((chain as any).buyLimits || "{}"); } catch { /* keep empty */ }

  res.json({
    chainId: chain.id,
    chainName: chain.name,
    symbol: chain.symbol,
    receiveAddress,
    buyRate: chain.buyRate,
    minAmount: chain.buyMinAmount,
    maxAmount: chain.buyMaxAmount ?? null,
    networks: networks.map(n => ({
      ...n,
      rate: buyRatesMap[n.id] || chain.buyRate,
      minAmount: buyLimitsMap[n.id]?.min ?? chain.buyMinAmount,
      maxAmount: buyLimitsMap[n.id]?.max ?? chain.buyMaxAmount ?? null,
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: POST /faucet/buy
// ─────────────────────────────────────────────────────────────────────────────
router.post("/faucet/buy", buyLimiter, async (req, res): Promise<void> => {
  const parsed = SubmitBuyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { chainId, userAddress, mainnetTxHash, networkId } = parsed.data;

  if (!/^0x[a-fA-F0-9]{64}$/.test(mainnetTxHash)) {
    res.status(400).json({ error: "Invalid transaction hash format" });
    return;
  }

  const allNetworks = await getAllPaymentNetworks();
  const network = allNetworks[networkId];
  if (!network) {
    res.status(400).json({ error: `Unsupported payment network: ${networkId}` });
    return;
  }

  const [chain] = await db
    .select()
    .from(chainsTable)
    .where(and(eq(chainsTable.id, chainId), eq(chainsTable.isEnabled, true)));

  if (!chain || !chain.buyEnabled) {
    res.status(404).json({ error: "Chain not found or buy not enabled" });
    return;
  }

  const addressValid = await isValidAddress(chain.chainType as ChainType, userAddress, chain.addressRegex);
  if (!addressValid) {
    res.status(400).json({ error: "Invalid user wallet address for this chain" });
    return;
  }

  let enabledNetworkIds: string[] = ["eth"];
  try { enabledNetworkIds = JSON.parse(chain.buyCurrencies); } catch { /* keep default */ }
  if (!enabledNetworkIds.includes(networkId)) {
    res.status(400).json({ error: `Payment via ${network.name} is not enabled for this chain` });
    return;
  }

  // Check if tx already exists
  let existing: typeof purchasesTable.$inferSelect | undefined;
  try {
    [existing] = await db
      .select()
      .from(purchasesTable)
      .where(eq(purchasesTable.mainnetTxHash, mainnetTxHash))
      .limit(1);
  } catch (dbErr: any) {
    req.log.error({ err: dbErr }, "Failed to check existing purchase — DB schema needs migration (missing columns)");
    res.status(500).json({ error: "Service temporarily unavailable. Please contact support with your transaction hash." });
    return;
  }

  if (existing?.status === "completed") {
    res.status(400).json({ error: "This transaction has already been processed successfully." });
    return;
  }
  if (existing?.status === "refund_required" || existing?.status === "refunded") {
    res.status(400).json({ error: `This transaction has been marked for refund (status: ${existing.status}).` });
    return;
  }

  let buyRatesMap: Record<string, string> = {};
  try { buyRatesMap = JSON.parse(chain.buyRates || "{}"); } catch { /* keep empty */ }
  const rate = parseFloat(buyRatesMap[networkId] || chain.buyRate);

  let purchase: typeof existing;
  let testnetAmount: string;

  if (existing?.status === "pending" || existing?.status === "failed") {
    // ── RETRY PATH ────────────────────────────────────────────────────────────
    purchase = existing;
    testnetAmount = (parseFloat(existing.mainnetAmountPaid) * rate).toFixed(8);

    // Check backoff
    if (existing.nextRetryAt && new Date() < existing.nextRetryAt) {
      const waitSec = Math.ceil((existing.nextRetryAt.getTime() - Date.now()) / 1000);
      res.status(429).json({ error: `Please wait ${waitSec}s before retrying.` });
      return;
    }
  } else {
    // ── NEW PURCHASE PATH ────────────────────────────────────────────────────
    let mainnetAmountPaid: string;
    let fromUserAddress: string | null = null;

    try {
      const provider = new ethers.JsonRpcProvider(network.rpcUrl);
      const tx = await provider.getTransaction(mainnetTxHash);

      if (!tx) {
        res.status(400).json({ error: `Transaction not found on ${network.name}. Wait for confirmation and try again.` });
        return;
      }

      // Capture sender address for potential refunds
      fromUserAddress = tx.from?.toLowerCase() ?? null;

      const receiveAddress = (chain.receiveAddress || resolveChainWalletAddress(chain.walletAddress)).toLowerCase();
      if (!tx.to || tx.to.toLowerCase() !== receiveAddress) {
        res.status(400).json({ error: `Transaction must send to: ${receiveAddress}` });
        return;
      }

      const amountEth = parseFloat(ethers.formatEther(tx.value));
      let buyLimitsMapPost: Record<string, { min?: string; max?: string }> = {};
      try { buyLimitsMapPost = JSON.parse((chain as any).buyLimits || "{}"); } catch { /* ignore */ }
      const perNetMin = buyLimitsMapPost[networkId]?.min;
      const perNetMax = buyLimitsMapPost[networkId]?.max;
      const effectiveMin = parseFloat(perNetMin ?? chain.buyMinAmount);
      const effectiveMax = perNetMax ? parseFloat(perNetMax) : (chain.buyMaxAmount ? parseFloat(chain.buyMaxAmount) : null);
      if (amountEth < effectiveMin) {
        res.status(400).json({ error: `Minimum amount for ${networkId} is ${effectiveMin}` });
        return;
      }
      if (effectiveMax !== null && amountEth > effectiveMax) {
        res.status(400).json({ error: `Maximum amount for ${networkId} is ${effectiveMax}` });
        return;
      }

      mainnetAmountPaid = ethers.formatEther(tx.value);
    } catch (err: any) {
      req.log.error({ err }, "Failed to verify mainnet tx");
      res.status(400).json({ error: "Failed to verify transaction. Please try again." });
      return;
    }

    testnetAmount = (parseFloat(mainnetAmountPaid) * rate).toFixed(8);

    try {
      const [inserted] = await db
        .insert(purchasesTable)
        .values({
          chainId,
          userAddress: userAddress.toLowerCase(),
          networkId,
          mainnetTxHash,
          mainnetAmountPaid,
          fromUserAddress,
          status: "pending",
        })
        .returning();
      purchase = inserted;

      await logOrderEvent({
        orderType: "FAUCET_BUY",
        orderId: String(purchase.id),
        event: "created",
        newStatus: "pending",
        metadata: { chainId, networkId, mainnetAmountPaid, fromUserAddress },
      });
    } catch (dbErr: any) {
      req.log.error({ err: dbErr }, "Failed to create purchase record — DB schema may be missing columns (run migration)");
      res.status(500).json({ error: "Order could not be saved. Please try again or contact support." });
      return;
    }
  }

  // ── Attempt payout ────────────────────────────────────────────────────────
  let testnetTxHash: string;
  try {
    const result = await sendChainTokens(
      chain.chainType as ChainType,
      parseRpcUrls(chain.rpcUrls, chain.rpcUrl),
      resolveChainPrivateKey(chain.privateKey),
      userAddress,
      testnetAmount,
    );
    testnetTxHash = result.txHash;
  } catch (err: any) {
    req.log.error({ err }, "Failed to send testnet tokens for purchase");

    // Record failure with backoff — wrapped so missing DB columns don't hide the real error
    const newRetryCount = (purchase!.retryCount ?? 0) + 1;
    const isPermanentFail = newRetryCount >= MAX_BUY_RETRIES;
    try {
      await db
        .update(purchasesTable)
        .set({
          retryCount: newRetryCount,
          nextRetryAt: isPermanentFail ? null : buyNextRetryAt(newRetryCount),
          lastError: err?.message ?? "Unknown error",
          status: isPermanentFail ? "failed" : "pending",
        })
        .where(eq(purchasesTable.id, purchase!.id));
    } catch (dbErr: any) {
      req.log.error({ err: dbErr }, "Failed to update purchase after payout failure — DB schema may need migration");
    }

    try {
      await logOrderEvent({
        orderType: "FAUCET_BUY",
        orderId: String(purchase!.id),
        event: "retry_attempt",
        oldStatus: purchase!.status,
        newStatus: isPermanentFail ? "failed" : "pending",
        error: err?.message,
        metadata: { retryCount: newRetryCount },
      });
    } catch { /* non-critical */ }

    res.status(500).json({
      error: isPermanentFail
        ? "Payout failed after multiple attempts. A refund will be issued automatically. Contact support with your tx hash if needed."
        : "Testnet tokens could not be sent. Your payment is saved — tap Retry to try again, or contact support with your tx hash.",
      isRetryable: !isPermanentFail,
    });
    return;
  }

  // ── Payout success ────────────────────────────────────────────────────────
  // Tokens already sent — DB update is best-effort; we return success regardless
  try {
    await db
      .update(purchasesTable)
      .set({ testnetAmountSent: testnetAmount, testnetTxHash, status: "completed", lastError: null })
      .where(eq(purchasesTable.id, purchase!.id));
  } catch (dbErr: any) {
    req.log.error({ err: dbErr }, "Failed to mark purchase completed — DB schema may need migration (tokens were sent)");
  }

  try {
    await logOrderEvent({
      orderType: "FAUCET_BUY",
      orderId: String(purchase!.id),
      event: "payout_sent",
      oldStatus: "pending",
      newStatus: "completed",
      txHash: testnetTxHash,
      metadata: { testnetAmount },
    });
  } catch { /* non-critical */ }

  broadcast({
    type: "buy_success",
    chainName: chain.name,
    chainId: chain.id,
    address: userAddress.toLowerCase(),
    txHash: testnetTxHash,
    amount: testnetAmount,
    symbol: chain.symbol,
  });

  void getReferralSettings().then(async settings => {
    if (settings.commissionOnBuy && (settings.buyChainIds.length === 0 || settings.buyChainIds.includes(chain.id))) {
      const [payChain] = await db
        .select({ coingeckoId: chainsTable.coingeckoId })
        .from(chainsTable)
        .where(eq(chainsTable.symbol, network.symbol.toUpperCase()))
        .limit(1);
      await creditCommissions({
        refereeAddress: userAddress,
        sourceType: "buy",
        sourceId: purchase!.id,
        chainId: chain.id,
        amountEth: purchase!.mainnetAmountPaid,
        fromCoingeckoId: payChain?.coingeckoId ?? null,
        settings,
      });
    }
  }).catch(() => {/* non-critical */});

  res.json({
    testnetTxHash,
    testnetAmountSent: testnetAmount,
    symbol: chain.symbol,
    chainName: chain.name,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: POST /faucet/buy/retry — manual retry (no rate limit)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/faucet/buy/retry", async (req, res): Promise<void> => {
  const mainnetTxHash = (req.body.mainnetTxHash as string | undefined)?.trim();
  const userAddress = (req.body.userAddress as string | undefined)?.trim().toLowerCase();

  if (!mainnetTxHash || !/^0x[a-fA-F0-9]{64}$/.test(mainnetTxHash)) {
    res.status(400).json({ error: "Invalid or missing mainnetTxHash" });
    return;
  }
  if (!userAddress) {
    res.status(400).json({ error: "Missing userAddress" });
    return;
  }

  let purchase: typeof purchasesTable.$inferSelect | undefined;
  try {
    [purchase] = await db
      .select()
      .from(purchasesTable)
      .where(eq(purchasesTable.mainnetTxHash, mainnetTxHash))
      .limit(1);
  } catch (dbErr: any) {
    req.log.error({ err: dbErr }, "Retry: failed to query purchase — DB schema may need migration");
    res.status(500).json({ error: "Unable to look up your order. Please contact support with your payment tx hash." });
    return;
  }

  if (!purchase) {
    res.status(404).json({ error: "Purchase not found. Use the normal buy flow." });
    return;
  }
  if (purchase.status === "completed") {
    res.status(400).json({ error: "This purchase was already completed successfully." });
    return;
  }
  if (purchase.status === "refund_required" || purchase.status === "refunded") {
    res.status(400).json({ error: `This purchase is in ${purchase.status} state.` });
    return;
  }
  if (purchase.userAddress !== userAddress) {
    res.status(403).json({ error: "Address mismatch." });
    return;
  }
  if (purchase.retryCount >= MAX_BUY_RETRIES) {
    res.status(400).json({ error: "Maximum retries reached. A refund will be issued automatically." });
    return;
  }

  // Backoff check
  if (purchase.nextRetryAt && new Date() < purchase.nextRetryAt) {
    const waitSec = Math.ceil((purchase.nextRetryAt.getTime() - Date.now()) / 1000);
    res.status(429).json({ error: `Please wait ${waitSec}s before retrying.` });
    return;
  }

  const [chain] = await db.select().from(chainsTable).where(eq(chainsTable.id, purchase.chainId));
  if (!chain || !chain.buyEnabled) {
    res.status(400).json({ error: "Chain not available" });
    return;
  }

  const allNetworksRetry = await db.select().from(paymentNetworksTable).where(eq(paymentNetworksTable.isEnabled, true));
  const network = allNetworksRetry.find(n => n.networkId === purchase.networkId);

  let buyRatesMapRetry: Record<string, string> = {};
  try { buyRatesMapRetry = JSON.parse(chain.buyRates || "{}"); } catch { /* keep empty */ }
  const rateRetry = parseFloat(buyRatesMapRetry[purchase.networkId ?? "eth"] || chain.buyRate);
  const testnetAmount = (parseFloat(purchase.mainnetAmountPaid) * rateRetry).toFixed(8);

  let testnetTxHash: string;
  try {
    const result = await sendChainTokens(
      chain.chainType as ChainType,
      parseRpcUrls(chain.rpcUrls, chain.rpcUrl),
      resolveChainPrivateKey(chain.privateKey),
      userAddress,
      testnetAmount,
    );
    testnetTxHash = result.txHash;
  } catch (err: any) {
    req.log.error({ err }, "Retry: failed to send testnet tokens");

    const newRetryCount = (purchase.retryCount ?? 0) + 1;
    const isPermanentFail = newRetryCount >= MAX_BUY_RETRIES;
    try {
      await db
        .update(purchasesTable)
        .set({
          retryCount: newRetryCount,
          nextRetryAt: isPermanentFail ? null : buyNextRetryAt(newRetryCount),
          lastError: err?.message ?? "Unknown error",
          status: isPermanentFail ? "failed" : "pending",
        })
        .where(eq(purchasesTable.id, purchase.id));
    } catch (dbErr: any) {
      req.log.error({ err: dbErr }, "Retry: failed to update purchase after failure — DB schema may need migration");
    }

    try {
      await logOrderEvent({
        orderType: "FAUCET_BUY",
        orderId: String(purchase.id),
        event: "retry_attempt",
        newStatus: isPermanentFail ? "failed" : "pending",
        error: err?.message,
        metadata: { retryCount: newRetryCount, manual: true },
      });
    } catch { /* non-critical */ }

    res.status(500).json({
      error: isPermanentFail
        ? "Maximum retries reached. A refund will be issued automatically."
        : "Still unable to send testnet tokens. Please try again in a moment, or contact support with your payment tx hash.",
      isRetryable: !isPermanentFail,
    });
    return;
  }

  // Tokens already sent — DB update is best-effort; return success regardless
  try {
    await db
      .update(purchasesTable)
      .set({ testnetAmountSent: testnetAmount, testnetTxHash, status: "completed", lastError: null, retryCount: (purchase.retryCount ?? 0) + 1 })
      .where(eq(purchasesTable.id, purchase.id));
  } catch (dbErr: any) {
    req.log.error({ err: dbErr }, "Retry: failed to mark purchase completed — DB schema may need migration (tokens were sent)");
  }

  try {
    await logOrderEvent({
      orderType: "FAUCET_BUY",
      orderId: String(purchase.id),
      event: "payout_sent",
      oldStatus: purchase.status,
      newStatus: "completed",
      txHash: testnetTxHash,
      metadata: { manual: true },
    });
  } catch { /* non-critical */ }

  broadcast({
    type: "buy_success",
    chainName: chain.name,
    chainId: chain.id,
    address: userAddress,
    txHash: testnetTxHash,
    amount: testnetAmount,
    symbol: chain.symbol,
  });

  void getReferralSettings().then(async settings => {
    if (settings.commissionOnBuy && (settings.buyChainIds.length === 0 || settings.buyChainIds.includes(chain.id))) {
      const [payChain] = await db
        .select({ coingeckoId: chainsTable.coingeckoId })
        .from(chainsTable)
        .where(eq(chainsTable.symbol, (network?.symbol ?? "ETH").toUpperCase()))
        .limit(1);
      await creditCommissions({
        refereeAddress: userAddress,
        sourceType: "buy",
        sourceId: purchase.id,
        chainId: chain.id,
        amountEth: purchase.mainnetAmountPaid,
        fromCoingeckoId: payChain?.coingeckoId ?? null,
        settings,
      });
    }
  }).catch(() => {/* non-critical */});

  res.json({
    testnetTxHash,
    testnetAmountSent: testnetAmount,
    symbol: chain.symbol,
    chainName: chain.name,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /faucet/buy/history/user?wallet=
// ─────────────────────────────────────────────────────────────────────────────
router.get("/faucet/buy/history/user", async (req, res): Promise<void> => {
  const wallet = (req.query.wallet as string | undefined)?.toLowerCase();
  if (!wallet) {
    res.status(400).json({ error: "wallet query param required" });
    return;
  }
  const rows = await db
    .select({
      id: purchasesTable.id,
      chainId: purchasesTable.chainId,
      networkId: purchasesTable.networkId,
      mainnetAmountPaid: purchasesTable.mainnetAmountPaid,
      testnetAmountSent: purchasesTable.testnetAmountSent,
      mainnetTxHash: purchasesTable.mainnetTxHash,
      testnetTxHash: purchasesTable.testnetTxHash,
      status: purchasesTable.status,
      refundStatus: purchasesTable.refundStatus,
      refundTxHash: purchasesTable.refundTxHash,
      createdAt: purchasesTable.createdAt,
      chainName: chainsTable.name,
      chainSymbol: chainsTable.symbol,
      explorerUrl: chainsTable.explorerUrl,
      networkName: paymentNetworksTable.name,
      networkSymbol: paymentNetworksTable.symbol,
      networkExplorerUrl: paymentNetworksTable.blockExplorerUrl,
    })
    .from(purchasesTable)
    .leftJoin(chainsTable, eq(purchasesTable.chainId, chainsTable.id))
    .leftJoin(paymentNetworksTable, eq(purchasesTable.networkId, paymentNetworksTable.networkId))
    .where(eq(purchasesTable.userAddress, wallet))
    .orderBy(desc(purchasesTable.createdAt))
    .limit(50);

  res.json(rows.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  })));
});

// ─────────────────────────────────────────────────────────────────────────────
// BUY RECOVERY — exported for unified recovery worker
// ─────────────────────────────────────────────────────────────────────────────
export async function runBuyRecovery(): Promise<void> {
  const now = new Date();
  const stuckCutoff = new Date(Date.now() - 5 * 60 * 1000); // 5min old

  // 1. Pending purchases with failed payout (nextRetryAt due or stuck >5min)
  const pendingStuck = await db
    .select()
    .from(purchasesTable)
    .where(
      and(
        eq(purchasesTable.status, "pending"),
        isNull(purchasesTable.testnetTxHash),
        lt(purchasesTable.createdAt, stuckCutoff),
        or(
          isNull(purchasesTable.nextRetryAt),
          lte(purchasesTable.nextRetryAt, now),
        ),
      ),
    )
    .limit(10);

  for (const purchase of pendingStuck) {
    if (purchase.retryCount >= MAX_BUY_RETRIES) {
      // Exceeded retries → fail
      await db.update(purchasesTable)
        .set({ status: "failed" })
        .where(eq(purchasesTable.id, purchase.id));
      await logOrderEvent({ orderType: "FAUCET_BUY", orderId: String(purchase.id), event: "status_changed", oldStatus: "pending", newStatus: "failed", error: "Max retries exceeded" });
      continue;
    }

    const [chain] = await db.select().from(chainsTable).where(eq(chainsTable.id, purchase.chainId)).limit(1);
    if (!chain || !chain.buyEnabled) continue;

    let buyRatesMap: Record<string, string> = {};
    try { buyRatesMap = JSON.parse(chain.buyRates || "{}"); } catch { /* ignore */ }
    const rate = parseFloat(buyRatesMap[purchase.networkId ?? "eth"] || chain.buyRate);
    const testnetAmount = (parseFloat(purchase.mainnetAmountPaid) * rate).toFixed(8);

    try {
      const result = await sendChainTokens(
        chain.chainType as ChainType,
        parseRpcUrls(chain.rpcUrls, chain.rpcUrl),
        resolveChainPrivateKey(chain.privateKey),
        purchase.userAddress,
        testnetAmount,
      );
      await db.update(purchasesTable)
        .set({ status: "completed", testnetAmountSent: testnetAmount, testnetTxHash: result.txHash, lastError: null })
        .where(eq(purchasesTable.id, purchase.id));
      await logOrderEvent({ orderType: "FAUCET_BUY", orderId: String(purchase.id), event: "payout_sent", oldStatus: "pending", newStatus: "completed", txHash: result.txHash, metadata: { recovery: true } });
      broadcast({ type: "buy_success", chainName: chain.name, chainId: chain.id, address: purchase.userAddress, txHash: result.txHash, amount: testnetAmount, symbol: chain.symbol });
    } catch (err: any) {
      const newRetryCount = (purchase.retryCount ?? 0) + 1;
      const isPermanentFail = newRetryCount >= MAX_BUY_RETRIES;
      await db.update(purchasesTable)
        .set({ retryCount: newRetryCount, nextRetryAt: isPermanentFail ? null : buyNextRetryAt(newRetryCount), lastError: err?.message, status: isPermanentFail ? "failed" : "pending" })
        .where(eq(purchasesTable.id, purchase.id));
      await logOrderEvent({ orderType: "FAUCET_BUY", orderId: String(purchase.id), event: "retry_attempt", newStatus: isPermanentFail ? "failed" : "pending", error: err?.message, metadata: { retryCount: newRetryCount, recovery: true } });
    }
  }

  // 2. Failed purchases → refund_required (after 30min grace)
  const failedCutoff = new Date(Date.now() - 30 * 60 * 1000);
  const failedPurchases = await db
    .select()
    .from(purchasesTable)
    .where(and(eq(purchasesTable.status, "failed"), lt(purchasesTable.createdAt, failedCutoff)))
    .limit(10);

  for (const purchase of failedPurchases) {
    await db.update(purchasesTable)
      .set({ status: "refund_required" })
      .where(eq(purchasesTable.id, purchase.id));
    await logOrderEvent({ orderType: "FAUCET_BUY", orderId: String(purchase.id), event: "status_changed", oldStatus: "failed", newStatus: "refund_required" });
  }

  // 3. refund_required purchases → execute refund
  const refundDue = await db
    .select()
    .from(purchasesTable)
    .where(and(eq(purchasesTable.status, "refund_required"), or(isNull(purchasesTable.refundStatus), eq(purchasesTable.refundStatus, "failed"))))
    .limit(5);

  for (const purchase of refundDue) {
    await executeBuyRefund(purchase);
  }
}

async function executeBuyRefund(purchase: typeof purchasesTable.$inferSelect): Promise<void> {
  if (!purchase.fromUserAddress) {
    // Can't refund without knowing who sent — mark for admin review
    await db.update(purchasesTable).set({ refundStatus: "failed", lastError: "No fromUserAddress recorded — manual refund required" }).where(eq(purchasesTable.id, purchase.id));
    await logOrderEvent({ orderType: "FAUCET_BUY", orderId: String(purchase.id), event: "refund_failed", error: "No fromUserAddress" });
    return;
  }

  const [chain] = await db.select().from(chainsTable).where(eq(chainsTable.id, purchase.chainId)).limit(1);
  if (!chain) return;

  const allNetworks = await db.select().from(paymentNetworksTable).where(eq(paymentNetworksTable.isEnabled, true));
  const network = allNetworks.find(n => n.networkId === purchase.networkId);
  if (!network) {
    await db.update(purchasesTable).set({ refundStatus: "failed", lastError: "Payment network not found" }).where(eq(purchasesTable.id, purchase.id));
    return;
  }

  // Refund: send mainnetAmountPaid - gas_buffer back to fromUserAddress on payment network
  const GAS_BUFFER = 0.0005;
  const refundAmount = (parseFloat(purchase.mainnetAmountPaid) - GAS_BUFFER).toFixed(8);
  if (parseFloat(refundAmount) <= 0) {
    await db.update(purchasesTable).set({ refundStatus: "failed", lastError: "Refund amount too small after gas deduction" }).where(eq(purchasesTable.id, purchase.id));
    return;
  }

  try {
    await db.update(purchasesTable).set({ refundStatus: "pending" }).where(eq(purchasesTable.id, purchase.id));
    // Use chain's private key connected to the payment network RPC
    const privateKey = resolveChainPrivateKey(chain.privateKey);
    const { sendTokens: sendEth } = await import("../lib/faucet");
    const { txHash } = await sendEth(network.rpcUrl, privateKey, purchase.fromUserAddress, refundAmount);
    await db.update(purchasesTable)
      .set({ status: "refunded", refundStatus: "completed", refundTxHash: txHash, refundAt: new Date() })
      .where(eq(purchasesTable.id, purchase.id));
    await logOrderEvent({ orderType: "FAUCET_BUY", orderId: String(purchase.id), event: "refund_sent", oldStatus: "refund_required", newStatus: "refunded", txHash, metadata: { refundAmount } });
  } catch (err: any) {
    await db.update(purchasesTable).set({ refundStatus: "failed", lastError: `Refund failed: ${err?.message}` }).where(eq(purchasesTable.id, purchase.id));
    await logOrderEvent({ orderType: "FAUCET_BUY", orderId: String(purchase.id), event: "refund_failed", error: err?.message });
  }
}

export default router;
