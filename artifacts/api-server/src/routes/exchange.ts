import { Router } from "express";
import { ethers } from "ethers";
import { db } from "@workspace/db";
import { exchangePairsTable, exchangeOrdersTable, purchasesTable, settingsTable, chainsTable } from "@workspace/db/schema";
import { eq, desc, and, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendTokens } from "../lib/faucet";
import { requireAdmin } from "../lib/adminAuth";
import { parseRpcUrls, checkRpcHealth } from "../lib/rpcFailover";
import { randomUUID } from "crypto";
import { encryptPrivateKey, decryptPrivateKey } from "../lib/encryption";
import { creditCommissions, getReferralSettings } from "../lib/referral";
import { broadcast } from "../lib/liveEvents";
import { logOrderEvent } from "../lib/orderEvents";
import { checkExchangeKilled } from "../lib/killSwitch";
import { runBuyRecovery } from "./buy";

const router = Router();

const SYSTEM_PRIVATE_KEY = process.env.FAUCET_PRIVATE_KEY ?? "";
const MAX_RETRIES = 3;
const BACKOFF_MINUTES = [2, 8, 32];

function nextRetryAt(retryCount: number): Date {
  const minutes = BACKOFF_MINUTES[retryCount] ?? 60;
  return new Date(Date.now() + minutes * 60 * 1000);
}

// ── Resolve which private key to use for a pair ───────────────────────────────
async function resolvePrivateKey(pair: { pairPrivateKey?: string | null }): Promise<string> {
  if (pair.pairPrivateKey?.trim()) return decryptPrivateKey(pair.pairPrivateKey.trim());
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "exchange_default_private_key")).limit(1);
  if (row?.value?.trim()) return decryptPrivateKey(row.value.trim());
  return SYSTEM_PRIVATE_KEY;
}

// ── Derive wallet address from private key safely ─────────────────────────────
function deriveAddress(privateKey: string): string | null {
  try {
    const w = new ethers.Wallet(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`);
    return w.address;
  } catch { return null; }
}

// ── Generate a fresh ephemeral deposit wallet ─────────────────────────────────
function generateDepositWallet(): { address: string; encryptedKey: string } {
  const wallet = ethers.Wallet.createRandom();
  return { address: wallet.address, encryptedKey: encryptPrivateKey(wallet.privateKey) };
}

// ── Try sendTokens across all fallback RPCs ───────────────────────────────────
async function sendTokensWithFallback(
  rpcUrls: string[],
  privateKey: string,
  toAddress: string,
  amount: string,
  gasLimit?: number | null,
): Promise<{ txHash: string }> {
  let lastErr: unknown;
  for (const rpc of rpcUrls) {
    try {
      return await sendTokens(rpc, privateKey, toAddress, amount, gasLimit);
    } catch (err) {
      lastErr = err;
      logger.warn({ rpc, err }, "sendTokens failed on RPC, trying next");
    }
  }
  throw lastErr;
}

// ── Get wallet balance on a chain ─────────────────────────────────────────────
async function getWalletBalance(rpcUrls: string[], address: string): Promise<string | null> {
  for (const rpc of rpcUrls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getBalance", params: [address, "latest"], id: 1 }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const { result } = await res.json() as { result?: string };
      if (!result) continue;
      return ethers.formatEther(BigInt(result));
    } catch { /* try next */ }
  }
  return null;
}

// ── Helper: parse RPC list from pair ─────────────────────────────────────────
function getPairRpcs(pair: { fromRpcUrls?: string | null; fromRpcUrl: string }, side: "from"): string[];
function getPairRpcs(pair: { toRpcUrls?: string | null; toRpcUrl: string }, side: "to"): string[];
function getPairRpcs(pair: any, side: "from" | "to"): string[] {
  return parseRpcUrls(pair[`${side}RpcUrls`], pair[`${side}RpcUrl`]);
}

// ── Poll for TX receipt — returns success, to, from, value ───────────────────
async function waitForTxReceipt(
  rpcUrls: string[],
  txHash: string,
  maxAttempts = 60,
  intervalMs = 2000,
): Promise<{ success: boolean; to: string; from: string; value: bigint } | null> {
  const rpc = rpcUrls[0]!;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash] }),
      });
      const json = await res.json() as any;
      if (json.result?.blockNumber) {
        const txRes = await fetch(rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_getTransactionByHash", params: [txHash] }),
        });
        const txJson = await txRes.json() as any;
        return {
          success: json.result.status === "0x1",
          to: (txJson.result?.to ?? "").toLowerCase(),
          from: (txJson.result?.from ?? "").toLowerCase(),
          value: BigInt(txJson.result?.value ?? "0x0"),
        };
      }
    } catch { /* keep polling */ }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}

// ── Best-effort sweep of deposit wallet to pair treasury ──────────────────────
async function sweepDepositWallet(
  order: typeof exchangeOrdersTable.$inferSelect,
  pair: typeof exchangePairsTable.$inferSelect,
): Promise<void> {
  if (!order.depositPrivateKey || !order.depositAddress) return;
  try {
    const pk = decryptPrivateKey(order.depositPrivateKey);
    const fromRpcs = getPairRpcs(pair, "from");
    const balance = await getWalletBalance(fromRpcs, order.depositAddress);
    if (!balance || parseFloat(balance) <= 0.001) return;
    const sweepAmount = (parseFloat(balance) - 0.001).toFixed(8);
    if (parseFloat(sweepAmount) <= 0) return;
    await sendTokensWithFallback(fromRpcs, pk, pair.fromDepositAddress, sweepAmount, pair.gasLimit);
    logger.info({ orderId: order.id }, "Deposit wallet swept to treasury");
  } catch (err) {
    logger.warn({ err, orderId: order.id }, "Sweep failed (non-critical)");
  }
}

// ── Execute refund from deposit wallet back to sender ────────────────────────
async function executeExchangeRefund(
  order: typeof exchangeOrdersTable.$inferSelect,
  pair: typeof exchangePairsTable.$inferSelect,
): Promise<void> {
  if (!order.depositPrivateKey || !order.fromUserAddress) {
    await db.update(exchangeOrdersTable)
      .set({ refundStatus: "failed", lastError: "Missing deposit key or sender address — manual refund required" })
      .where(eq(exchangeOrdersTable.id, order.id));
    await logOrderEvent({ orderType: "CROSS_CHAIN_SWAP", orderId: order.id, event: "refund_failed", error: "No depositPrivateKey or fromUserAddress" });
    return;
  }

  const pk = decryptPrivateKey(order.depositPrivateKey);
  const fromRpcs = getPairRpcs(pair, "from");
  const balance = await getWalletBalance(fromRpcs, order.depositAddress!);

  if (!balance || parseFloat(balance) <= 0.001) {
    // Nothing meaningful to refund
    await db.update(exchangeOrdersTable)
      .set({ status: "refunded", refundStatus: "completed", refundAt: new Date(), lastError: "Balance zero or too low to refund" })
      .where(eq(exchangeOrdersTable.id, order.id));
    await logOrderEvent({ orderType: "CROSS_CHAIN_SWAP", orderId: order.id, event: "status_changed", oldStatus: "refund_required", newStatus: "refunded", error: "Balance too low" });
    return;
  }

  const refundAmount = (parseFloat(balance) - 0.001).toFixed(8);

  try {
    await db.update(exchangeOrdersTable).set({ refundStatus: "pending" }).where(eq(exchangeOrdersTable.id, order.id));
    const { txHash } = await sendTokensWithFallback(fromRpcs, pk, order.fromUserAddress, refundAmount, pair.gasLimit);
    await db.update(exchangeOrdersTable)
      .set({ status: "refunded", refundStatus: "completed", refundTxHash: txHash, refundAt: new Date() })
      .where(eq(exchangeOrdersTable.id, order.id));
    await logOrderEvent({ orderType: "CROSS_CHAIN_SWAP", orderId: order.id, event: "refund_sent", oldStatus: "refund_required", newStatus: "refunded", txHash, metadata: { refundAmount } });
    logger.info({ orderId: order.id, txHash }, "Exchange refund sent");
  } catch (err: any) {
    await db.update(exchangeOrdersTable)
      .set({ refundStatus: "failed", lastError: `Refund failed: ${err?.message}` })
      .where(eq(exchangeOrdersTable.id, order.id));
    await logOrderEvent({ orderType: "CROSS_CHAIN_SWAP", orderId: order.id, event: "refund_failed", error: err?.message });
    logger.error({ err, orderId: order.id }, "Exchange refund failed");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /exchange/preflight?pairId=
// ─────────────────────────────────────────────────────────────────────────────
router.get("/exchange/preflight", async (req, res): Promise<void> => {
  const pairId = parseInt(String(req.query.pairId));
  if (isNaN(pairId)) { res.json({ ok: false, reason: "Invalid pairId" }); return; }

  const killMsg = await checkExchangeKilled();
  if (killMsg) { res.json({ ok: false, reason: killMsg }); return; }

  const [pair] = await db.select().from(exchangePairsTable).where(eq(exchangePairsTable.id, pairId)).limit(1);
  if (!pair || !pair.isEnabled) { res.json({ ok: false, reason: "Exchange pair not found or disabled" }); return; }

  const checks: Record<string, boolean> = {
    pairEnabled: true,
    fromRpcHealthy: false,
    toRpcHealthy: false,
    walletConfigured: false,
    reserveSufficient: false,
  };

  // From-chain RPC
  try {
    const h = await checkRpcHealth(getPairRpcs(pair, "from")[0]!);
    checks.fromRpcHealthy = h.status === "ok";
  } catch { checks.fromRpcHealthy = false; }

  // To-chain RPC
  try {
    const h = await checkRpcHealth(getPairRpcs(pair, "to")[0]!);
    checks.toRpcHealthy = h.status === "ok";
  } catch { checks.toRpcHealthy = false; }

  if (!checks.fromRpcHealthy) {
    res.json({ ok: false, reason: `Source chain RPC unavailable (${pair.fromChainName})`, checks });
    return;
  }
  if (!checks.toRpcHealthy) {
    res.json({ ok: false, reason: `Destination chain RPC unavailable (${pair.toChainName})`, checks });
    return;
  }

  // Wallet & reserve
  try {
    const pk = await resolvePrivateKey(pair);
    const address = deriveAddress(pk);
    checks.walletConfigured = !!address;
    if (address) {
      const balance = await getWalletBalance(getPairRpcs(pair, "to"), address);
      const GAS_RESERVE = 0.002;
      checks.reserveSufficient = balance !== null && parseFloat(balance) >= parseFloat(pair.minAmount) + GAS_RESERVE;
      if (!checks.reserveSufficient) {
        res.json({ ok: false, reason: `Insufficient liquidity on ${pair.toChainName}`, checks });
        return;
      }
    } else {
      res.json({ ok: false, reason: "Exchange wallet not configured", checks });
      return;
    }
  } catch {
    res.json({ ok: false, reason: "Wallet check failed", checks });
    return;
  }

  res.json({ ok: true, reason: null, checks });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /exchange/pairs
// ─────────────────────────────────────────────────────────────────────────────
router.get("/exchange/pairs", async (_req, res): Promise<void> => {
  const pairs = await db.select({
    id: exchangePairsTable.id,
    name: exchangePairsTable.name,
    fromChainName: exchangePairsTable.fromChainName,
    fromSymbol: exchangePairsTable.fromSymbol,
    fromChainId: exchangePairsTable.fromChainId,
    fromRpcUrl: exchangePairsTable.fromRpcUrl,
    fromRpcUrls: exchangePairsTable.fromRpcUrls,
    fromExplorerUrl: exchangePairsTable.fromExplorerUrl,
    fromDepositAddress: exchangePairsTable.fromDepositAddress,
    fromLogoUrl: exchangePairsTable.fromLogoUrl,
    toChainName: exchangePairsTable.toChainName,
    toSymbol: exchangePairsTable.toSymbol,
    toChainId: exchangePairsTable.toChainId,
    toRpcUrl: exchangePairsTable.toRpcUrl,
    toRpcUrls: exchangePairsTable.toRpcUrls,
    toExplorerUrl: exchangePairsTable.toExplorerUrl,
    toLogoUrl: exchangePairsTable.toLogoUrl,
    feePercent: exchangePairsTable.feePercent,
    minAmount: exchangePairsTable.minAmount,
    maxAmount: exchangePairsTable.maxAmount,
    isEnabled: exchangePairsTable.isEnabled,
  }).from(exchangePairsTable).where(eq(exchangePairsTable.isEnabled, true));
  res.json(pairs);
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /exchange/pairs/:id/wallet-balance
// ─────────────────────────────────────────────────────────────────────────────
router.get("/exchange/pairs/:id/wallet-balance", async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const [pair] = await db.select().from(exchangePairsTable).where(eq(exchangePairsTable.id, id)).limit(1);
  if (!pair || !pair.isEnabled) { res.status(404).json({ error: "Pair not found" }); return; }
  try {
    const pk = await resolvePrivateKey(pair);
    const address = deriveAddress(pk);
    if (!address) { res.json({ balance: null, address: null, warning: true }); return; }
    const toRpcs = getPairRpcs(pair, "to");
    const balance = await getWalletBalance(toRpcs, address);
    const GAS_RESERVE = 0.002;
    const warning = balance === null || parseFloat(balance) < parseFloat(pair.minAmount) + GAS_RESERVE;
    res.json({ balance, address, warning, gasReserve: GAS_RESERVE });
  } catch {
    res.json({ balance: null, address: null, warning: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: POST /exchange/orders — initiate swap
// ─────────────────────────────────────────────────────────────────────────────
router.post("/exchange/orders", async (req, res): Promise<void> => {
  // Kill switch
  const killMsg = await checkExchangeKilled();
  if (killMsg) { res.status(503).json({ error: killMsg }); return; }

  const { pairId, userAddress, fromAmount } = req.body ?? {};
  if (!pairId || typeof pairId !== "number" || !userAddress || !fromAmount) {
    res.status(400).json({ error: "pairId (number), userAddress, and fromAmount are required" }); return;
  }

  if (!ethers.isAddress(userAddress)) {
    res.status(400).json({ error: "Invalid wallet address" });
    return;
  }

  const [pair] = await db.select().from(exchangePairsTable).where(eq(exchangePairsTable.id, pairId)).limit(1);
  if (!pair || !pair.isEnabled) { res.status(404).json({ error: "Exchange pair not found or disabled" }); return; }

  const from = parseFloat(fromAmount);
  const min = parseFloat(pair.minAmount);
  const max = parseFloat(pair.maxAmount);
  if (isNaN(from) || from < min || from > max) {
    res.status(400).json({ error: `Amount must be between ${min} and ${max} ${pair.fromSymbol}` });
    return;
  }

  const feePercent = parseFloat(pair.feePercent);
  const feeAmt = (from * feePercent) / 100;
  const toAmt = from - feeAmt;

  // Pre-check: exchange wallet balance
  const pk = await resolvePrivateKey(pair);
  if (!pk) {
    res.status(503).json({ error: "Exchange wallet is not configured. Swaps are currently unavailable." });
    return;
  }
  const walletAddress = deriveAddress(pk);
  if (!walletAddress) {
    res.status(503).json({ error: "Exchange wallet configuration error. Please contact support." });
    return;
  }
  const toRpcs = getPairRpcs(pair, "to");
  const balance = await getWalletBalance(toRpcs, walletAddress);
  if (balance === null) {
    res.status(503).json({ error: `Cannot verify exchange wallet balance on ${pair.toChainName}. Please try again later.` });
    return;
  }
  const GAS_RESERVE = 0.002;
  if (parseFloat(balance) < toAmt + GAS_RESERVE) {
    res.status(503).json({
      error: `Low liquidity — exchange wallet balance insufficient on ${pair.toChainName}. Available: ${parseFloat(balance).toFixed(6)} ${pair.toSymbol} (need ${(toAmt + GAS_RESERVE).toFixed(6)} including gas). Please try a smaller amount or contact support.`,
      code: "LOW_LIQUIDITY",
    });
    return;
  }

  // Generate per-order deposit wallet
  const { address: depositAddress, encryptedKey: depositPrivateKey } = generateDepositWallet();

  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await db.insert(exchangeOrdersTable).values({
    id,
    pairId,
    userAddress: userAddress.toLowerCase(),
    fromAmount: fromAmount,
    feeAmount: feeAmt.toFixed(8),
    toAmount: toAmt.toFixed(8),
    status: "pending",
    expiresAt,
    depositAddress,
    depositPrivateKey,
  });

  await logOrderEvent({
    orderType: "CROSS_CHAIN_SWAP",
    orderId: id,
    event: "created",
    newStatus: "pending",
    metadata: { pairId, fromAmount, toAmount: toAmt.toFixed(8), depositAddress },
  });

  ensureRecoveryWorkerRunning();

  res.json({
    orderId: id,
    depositAddress, // per-order unique address
    fromAmount,
    feeAmount: feeAmt.toFixed(8),
    toAmount: toAmt.toFixed(8),
    feePercent: pair.feePercent,
    fromSymbol: pair.fromSymbol,
    toSymbol: pair.toSymbol,
    fromChainName: pair.fromChainName,
    toChainName: pair.toChainName,
    expiresAt: expiresAt.toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: POST /exchange/orders/:id/confirm
// ─────────────────────────────────────────────────────────────────────────────
router.post("/exchange/orders/:id/confirm", async (req, res): Promise<void> => {
  const { fromTxHash } = req.body ?? {};
  if (!fromTxHash || typeof fromTxHash !== "string") {
    res.status(400).json({ error: "fromTxHash is required" }); return;
  }
  const orderId = req.params.id;

  const [order] = await db.select().from(exchangeOrdersTable).where(eq(exchangeOrdersTable.id, orderId)).limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (order.status !== "pending") { res.status(400).json({ error: `Order already ${order.status}` }); return; }
  if (new Date() > order.expiresAt) {
    await db.update(exchangeOrdersTable).set({ status: "expired" }).where(eq(exchangeOrdersTable.id, orderId));
    res.status(400).json({ error: "Order expired. Please start a new swap." });
    return;
  }

  const [pair] = await db.select().from(exchangePairsTable).where(eq(exchangePairsTable.id, order.pairId)).limit(1);
  if (!pair) { res.status(400).json({ error: "Exchange pair no longer available" }); return; }

  await db.update(exchangeOrdersTable).set({ status: "confirming", fromTxHash }).where(eq(exchangeOrdersTable.id, orderId));
  res.json({ status: "confirming", message: "TX received — verifying on-chain…" });

  void (async () => {
    try {
      const receipt = await waitForTxReceipt(getPairRpcs(pair, "from"), fromTxHash);
      if (!receipt || !receipt.success) {
        await db.update(exchangeOrdersTable).set({ status: "failed", failReason: "From-chain TX failed or not found" }).where(eq(exchangeOrdersTable.id, orderId));
        await logOrderEvent({ orderType: "CROSS_CHAIN_SWAP", orderId, event: "status_changed", oldStatus: "confirming", newStatus: "failed", error: "TX failed or not found" });
        return;
      }

      // Capture sender address for potential refund
      const fromUserAddress = receipt.from || null;

      // Verify destination: use per-order deposit address (fall back to pair address for old orders)
      const expectedDeposit = order.depositAddress?.toLowerCase() ?? pair.fromDepositAddress.toLowerCase();
      if (receipt.to !== expectedDeposit) {
        await db.update(exchangeOrdersTable).set({ status: "failed", failReason: "TX sent to wrong address", fromUserAddress }).where(eq(exchangeOrdersTable.id, orderId));
        await logOrderEvent({ orderType: "CROSS_CHAIN_SWAP", orderId, event: "status_changed", oldStatus: "confirming", newStatus: "failed", error: "Wrong recipient" });
        return;
      }

      const expectedWei = ethers.parseEther(order.fromAmount);
      const tolerance = (expectedWei * 5n) / 1000n;
      if (receipt.value < expectedWei - tolerance) {
        await db.update(exchangeOrdersTable).set({ status: "failed", failReason: `Insufficient amount sent. Expected ~${order.fromAmount} ${pair.fromSymbol}`, fromUserAddress }).where(eq(exchangeOrdersTable.id, orderId));
        await logOrderEvent({ orderType: "CROSS_CHAIN_SWAP", orderId, event: "status_changed", oldStatus: "confirming", newStatus: "failed", error: "Insufficient amount" });
        return;
      }

      // Store fromUserAddress before payout attempt
      await db.update(exchangeOrdersTable).set({ fromUserAddress }).where(eq(exchangeOrdersTable.id, orderId));

      const privateKey = await resolvePrivateKey(pair);
      if (!privateKey) {
        await db.update(exchangeOrdersTable).set({ status: "failed", failReason: "Exchange wallet not configured" }).where(eq(exchangeOrdersTable.id, orderId));
        return;
      }

      // Send toToken
      const toRpcs = getPairRpcs(pair, "to");
      const { txHash: toTxHash } = await sendTokensWithFallback(toRpcs, privateKey, order.userAddress, order.toAmount, pair.gasLimit);
      await db.update(exchangeOrdersTable).set({ status: "completed", toTxHash, completedAt: new Date() }).where(eq(exchangeOrdersTable.id, orderId));
      await logOrderEvent({ orderType: "CROSS_CHAIN_SWAP", orderId, event: "payout_sent", oldStatus: "confirming", newStatus: "completed", txHash: toTxHash });
      logger.info({ orderId, fromTxHash, toTxHash }, "Exchange order completed");

      broadcast({
        type: "swap_success",
        address: order.userAddress,
        txHash: toTxHash,
        fromChainName: pair.fromChainName ?? undefined,
        toChainName: pair.toChainName ?? undefined,
        fromSymbol: pair.fromSymbol ?? undefined,
        toSymbol: pair.toSymbol ?? undefined,
        fromAmount: order.fromAmount,
        toAmount: order.toAmount,
      });

      // Sweep deposit wallet to treasury (fire-and-forget)
      const updatedOrder = { ...order, fromUserAddress, depositPrivateKey: order.depositPrivateKey, depositAddress: order.depositAddress };
      void sweepDepositWallet(updatedOrder, pair);

      void getReferralSettings().then(async settings => {
        if (settings.commissionOnExchange && (settings.exchangeChainIds.length === 0 || settings.exchangeChainIds.includes(pair.fromChainId))) {
          const [fromChainData] = await db.select({ coingeckoId: chainsTable.coingeckoId }).from(chainsTable).where(eq(chainsTable.id, pair.fromChainId)).limit(1);
          await creditCommissions({ refereeAddress: order.userAddress, sourceType: "exchange", chainId: pair.fromChainId, amountEth: order.fromAmount, fromCoingeckoId: fromChainData?.coingeckoId ?? null, settings });
        }
      }).catch(() => {/* non-critical */});
    } catch (err: any) {
      logger.error({ err, orderId }, "Exchange order failed during confirm");
      const newRetryCount = (order.retryCount ?? 0) + 1;
      const isPermanentFail = newRetryCount >= MAX_RETRIES;
      await db.update(exchangeOrdersTable).set({
        status: isPermanentFail ? "refund_required" : "failed",
        failReason: err?.message ?? "Unexpected error",
        retryCount: newRetryCount,
        nextRetryAt: isPermanentFail ? null : nextRetryAt(newRetryCount),
        lastError: err?.message,
      }).where(eq(exchangeOrdersTable.id, orderId));
      await logOrderEvent({ orderType: "CROSS_CHAIN_SWAP", orderId, event: "status_changed", oldStatus: "confirming", newStatus: isPermanentFail ? "refund_required" : "failed", error: err?.message });
    }
  })();
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: PATCH /exchange/orders/:id/txhash
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/exchange/orders/:id/txhash", async (req, res): Promise<void> => {
  const { fromTxHash } = req.body ?? {};
  if (!fromTxHash || typeof fromTxHash !== "string") {
    res.status(400).json({ error: "fromTxHash required" }); return;
  }
  const orderId = req.params.id;
  const [order] = await db.select().from(exchangeOrdersTable).where(eq(exchangeOrdersTable.id, orderId)).limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (order.status === "pending") {
    await db.update(exchangeOrdersTable).set({ fromTxHash }).where(eq(exchangeOrdersTable.id, orderId));
  }
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /exchange/orders/history?wallet=
// ─────────────────────────────────────────────────────────────────────────────
router.get("/exchange/orders/history", async (req, res): Promise<void> => {
  const wallet = (req.query.wallet as string | undefined)?.toLowerCase();
  if (!wallet || !ethers.isAddress(wallet)) {
    res.status(400).json({ error: "wallet query param with valid EVM address required" });
    return;
  }
  const rows = await db
    .select({
      id: exchangeOrdersTable.id,
      fromAmount: exchangeOrdersTable.fromAmount,
      toAmount: exchangeOrdersTable.toAmount,
      feeAmount: exchangeOrdersTable.feeAmount,
      status: exchangeOrdersTable.status,
      fromTxHash: exchangeOrdersTable.fromTxHash,
      toTxHash: exchangeOrdersTable.toTxHash,
      refundTxHash: exchangeOrdersTable.refundTxHash,
      refundStatus: exchangeOrdersTable.refundStatus,
      createdAt: exchangeOrdersTable.createdAt,
      completedAt: exchangeOrdersTable.completedAt,
      fromSymbol: exchangePairsTable.fromSymbol,
      fromChainName: exchangePairsTable.fromChainName,
      fromChainId: exchangePairsTable.fromChainId,
      fromLogoUrl: exchangePairsTable.fromLogoUrl,
      fromExplorerUrl: exchangePairsTable.fromExplorerUrl,
      toSymbol: exchangePairsTable.toSymbol,
      toChainName: exchangePairsTable.toChainName,
      toChainId: exchangePairsTable.toChainId,
      toLogoUrl: exchangePairsTable.toLogoUrl,
      toExplorerUrl: exchangePairsTable.toExplorerUrl,
    })
    .from(exchangeOrdersTable)
    .leftJoin(exchangePairsTable, eq(exchangeOrdersTable.pairId, exchangePairsTable.id))
    .where(eq(exchangeOrdersTable.userAddress, wallet))
    .orderBy(desc(exchangeOrdersTable.createdAt))
    .limit(50);

  res.json(rows.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  })));
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /exchange/orders/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get("/exchange/orders/:id", async (req, res): Promise<void> => {
  const [order] = await db.select().from(exchangeOrdersTable).where(eq(exchangeOrdersTable.id, req.params.id)).limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  // Never expose deposit private key
  const { depositPrivateKey: _dk, ...safeOrder } = order;
  res.json(safeOrder);
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Exchange Settings
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/exchange/settings", requireAdmin, async (_req, res): Promise<void> => {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "exchange_default_private_key")).limit(1);
  const key = row?.value?.trim() || SYSTEM_PRIVATE_KEY;
  const address = deriveAddress(key);
  res.json({ hasCustomKey: !!(row?.value?.trim()), walletAddress: address });
});

router.put("/admin/exchange/settings", requireAdmin, async (req, res): Promise<void> => {
  const { defaultPrivateKey } = req.body ?? {};
  if (typeof defaultPrivateKey !== "string") { res.status(400).json({ error: "defaultPrivateKey is required" }); return; }
  const trimmed = defaultPrivateKey.trim();
  if (trimmed && !deriveAddress(trimmed)) { res.status(400).json({ error: "Invalid private key" }); return; }
  if (trimmed) {
    const encrypted = encryptPrivateKey(trimmed);
    await db.insert(settingsTable).values({ key: "exchange_default_private_key", value: encrypted })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: encrypted } });
  } else {
    await db.delete(settingsTable).where(eq(settingsTable.key, "exchange_default_private_key"));
  }
  const activeKey = trimmed || SYSTEM_PRIVATE_KEY;
  const address = deriveAddress(activeKey);
  res.json({ ok: true, walletAddress: address });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Pair wallet balance
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/exchange/pairs/:id/wallet-balance", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const [pair] = await db.select().from(exchangePairsTable).where(eq(exchangePairsTable.id, id)).limit(1);
  if (!pair) { res.status(404).json({ error: "Pair not found" }); return; }
  try {
    const pk = await resolvePrivateKey(pair);
    const address = deriveAddress(pk);
    if (!address) { res.json({ balance: null, address: null }); return; }
    const toRpcs = getPairRpcs(pair, "to");
    const balance = await getWalletBalance(toRpcs, address);
    res.json({ balance, address, symbol: pair.toSymbol, chain: pair.toChainName });
  } catch (err: any) {
    res.json({ balance: null, address: null, error: err?.message });
  }
});

function parsePairBody(body: any, requireAll = true) {
  const b = body ?? {};
  if (requireAll) {
    const required = ["name","fromChainName","fromSymbol","fromChainId","fromRpcUrl","fromDepositAddress","toChainName","toSymbol","toChainId","toRpcUrl"];
    for (const k of required) { if (!b[k] && b[k] !== 0) return { error: `${k} is required` }; }
  }
  return { data: b };
}

router.get("/admin/exchange/pairs", requireAdmin, async (_req, res): Promise<void> => {
  const pairs = await db.select().from(exchangePairsTable).orderBy(exchangePairsTable.id);
  res.json(pairs);
});

router.post("/admin/exchange/pairs", requireAdmin, async (req, res): Promise<void> => {
  const { error, data } = parsePairBody(req.body, true);
  if (error) { res.status(400).json({ error }); return; }
  const [pair] = await db.insert(exchangePairsTable).values({
    ...data,
    fromChainId: Number(data.fromChainId),
    toChainId: Number(data.toChainId),
    pairPrivateKey: data.pairPrivateKey?.trim() ? encryptPrivateKey(data.pairPrivateKey.trim()) : null,
  }).returning();
  res.status(201).json(pair);
});

router.put("/admin/exchange/pairs/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const body = req.body ?? {};
  const update: Record<string, unknown> = { ...body };
  if (update.fromChainId !== undefined) update.fromChainId = Number(update.fromChainId);
  if (update.toChainId !== undefined) update.toChainId = Number(update.toChainId);
  if ("pairPrivateKey" in update) {
    const pk = (update.pairPrivateKey as string)?.trim() || null;
    update.pairPrivateKey = pk ? encryptPrivateKey(pk) : null;
  }
  const [pair] = await db.update(exchangePairsTable).set(update).where(eq(exchangePairsTable.id, id)).returning();
  if (!pair) { res.status(404).json({ error: "Pair not found" }); return; }
  res.json(pair);
});

router.delete("/admin/exchange/pairs/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  await db.delete(exchangePairsTable).where(eq(exchangePairsTable.id, id));
  res.json({ ok: true });
});

router.get("/admin/exchange/orders", requireAdmin, async (_req, res): Promise<void> => {
  const orders = await db.select().from(exchangeOrdersTable).orderBy(exchangeOrdersTable.createdAt).limit(200);
  const now = new Date();
  const staleIds = orders.filter(o => o.status === "pending" && new Date(o.expiresAt) < now).map(o => o.id);
  if (staleIds.length > 0) {
    await Promise.all(staleIds.map(id => db.update(exchangeOrdersTable).set({ status: "expired" }).where(eq(exchangeOrdersTable.id, id))));
    orders.forEach(o => { if (staleIds.includes(o.id)) o.status = "expired"; });
  }
  // Never expose deposit private keys
  res.json(orders.reverse().map(({ depositPrivateKey: _dk, ...o }) => o));
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Retry failed order
// ─────────────────────────────────────────────────────────────────────────────
router.post("/admin/exchange/orders/:id/retry", requireAdmin, async (req, res): Promise<void> => {
  const orderId = String(req.params.id);
  const bodyTxHash = typeof req.body?.fromTxHash === "string" ? req.body.fromTxHash.trim() : null;

  const [order] = await db.select().from(exchangeOrdersTable).where(eq(exchangeOrdersTable.id, orderId)).limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (!["failed", "pending", "refund_required"].includes(order.status)) {
    res.status(400).json({ error: `Cannot retry order with status "${order.status}".` }); return;
  }

  const resolvedTxHash = bodyTxHash || order.fromTxHash;
  if (!resolvedTxHash) {
    res.status(400).json({ error: "Order has no fromTxHash — provide it in the request body to force-process." }); return;
  }

  const [pair] = await db.select().from(exchangePairsTable).where(eq(exchangePairsTable.id, order.pairId)).limit(1);
  if (!pair) { res.status(404).json({ error: "Exchange pair no longer exists." }); return; }

  const privateKey = await resolvePrivateKey(pair);
  if (!privateKey) { res.status(500).json({ error: "Exchange wallet private key not configured." }); return; }

  await db.update(exchangeOrdersTable)
    .set({ status: "confirming", failReason: null, fromTxHash: resolvedTxHash, retryCount: 0, nextRetryAt: null })
    .where(eq(exchangeOrdersTable.id, orderId));

  res.json({ status: "retrying", message: "Processing started — sending destination tokens now." });

  void (async () => {
    try {
      const toRpcs = getPairRpcs(pair, "to");
      const { txHash: toTxHash } = await sendTokensWithFallback(toRpcs, privateKey, order.userAddress, order.toAmount, pair.gasLimit);
      await db.update(exchangeOrdersTable).set({ status: "completed", toTxHash, completedAt: new Date(), failReason: null }).where(eq(exchangeOrdersTable.id, orderId));
      await logOrderEvent({ orderType: "CROSS_CHAIN_SWAP", orderId, event: "payout_sent", oldStatus: "failed", newStatus: "completed", txHash: toTxHash, metadata: { adminRetry: true } });
      logger.info({ orderId, toTxHash }, "Exchange order completed via admin retry");
    } catch (err: any) {
      logger.error({ err, orderId }, "Admin retry failed");
      await db.update(exchangeOrdersTable).set({ status: "failed", failReason: `Admin retry failed: ${err?.message ?? "Unexpected error"}` }).where(eq(exchangeOrdersTable.id, orderId));
    }
  })();
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: RPC health check
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/exchange/pairs/:id/rpc-health", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const side = (req.query.side === "to" ? "to" : "from") as "from" | "to";
  const [pair] = await db.select().from(exchangePairsTable).where(eq(exchangePairsTable.id, id)).limit(1);
  if (!pair) { res.status(404).json({ error: "Pair not found" }); return; }
  const urls = parseRpcUrls(pair[`${side}RpcUrls`], pair[`${side}RpcUrl`]);
  const results = await Promise.all(urls.map(url => checkRpcHealth(url)));
  res.json(results);
});

export default router;

// ─────────────────────────────────────────────────────────────────────────────
// SHARED: sendAndComplete helper
// ─────────────────────────────────────────────────────────────────────────────
async function sendAndComplete(
  orderId: string,
  order: { userAddress: string; toAmount: string; fromAmount: string; fromTxHash: string | null; retryCount: number; depositPrivateKey?: string | null; depositAddress?: string | null; fromUserAddress?: string | null },
  pair: typeof exchangePairsTable.$inferSelect,
  label: string,
): Promise<void> {
  try {
    const privateKey = await resolvePrivateKey(pair);
    if (!privateKey) {
      await db.update(exchangeOrdersTable).set({ status: "failed", failReason: `Exchange wallet not configured (${label})` }).where(eq(exchangeOrdersTable.id, orderId));
      return;
    }
    const toRpcs = getPairRpcs(pair, "to");
    const { txHash: toTxHash } = await sendTokensWithFallback(toRpcs, privateKey, order.userAddress, order.toAmount, pair.gasLimit);
    await db.update(exchangeOrdersTable).set({ status: "completed", toTxHash, completedAt: new Date() }).where(eq(exchangeOrdersTable.id, orderId));
    await logOrderEvent({ orderType: "CROSS_CHAIN_SWAP", orderId, event: "payout_sent", newStatus: "completed", txHash: toTxHash, metadata: { label } });
    logger.info({ orderId, toTxHash }, `${label}: order completed`);
    broadcast({
      type: "swap_success",
      address: order.userAddress,
      txHash: toTxHash,
      fromChainName: pair.fromChainName ?? undefined,
      toChainName: pair.toChainName ?? undefined,
      fromSymbol: pair.fromSymbol ?? undefined,
      toSymbol: pair.toSymbol ?? undefined,
      fromAmount: order.fromAmount,
      toAmount: order.toAmount,
    });
    void sweepDepositWallet(order as any, pair);
  } catch (err: any) {
    logger.error({ err, orderId }, `${label}: send failed`);
    const newRetryCount = (order.retryCount ?? 0) + 1;
    const isPermanentFail = newRetryCount >= MAX_RETRIES;
    await db.update(exchangeOrdersTable).set({
      status: isPermanentFail ? "refund_required" : "failed",
      failReason: `${label}: ${err?.message ?? "Unexpected error"}`,
      retryCount: newRetryCount,
      nextRetryAt: isPermanentFail ? null : nextRetryAt(newRetryCount),
      lastError: err?.message,
    }).where(eq(exchangeOrdersTable.id, orderId));
    await logOrderEvent({ orderType: "CROSS_CHAIN_SWAP", orderId, event: "retry_attempt", newStatus: isPermanentFail ? "refund_required" : "failed", error: err?.message, metadata: { retryCount: newRetryCount, label } });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKGROUND: Unified recovery worker
// ─────────────────────────────────────────────────────────────────────────────
let recoveryIntervalId: ReturnType<typeof setInterval> | null = null;

export function ensureRecoveryWorkerRunning(): void {
  if (recoveryIntervalId !== null) return;
  recoveryIntervalId = setInterval(() => void runOrderRecovery(), 2 * 60 * 1000);
  logger.info("Unified order recovery worker started (2min interval)");
}

function stopRecoveryWorker(): void {
  if (recoveryIntervalId === null) return;
  clearInterval(recoveryIntervalId);
  recoveryIntervalId = null;
  logger.info("Unified order recovery worker stopped");
}

async function runOrderRecovery(): Promise<void> {
  // Check if any active work exists
  const [hasExchangeActive] = await db
    .select({ id: exchangeOrdersTable.id })
    .from(exchangeOrdersTable)
    .where(or(
      eq(exchangeOrdersTable.status, "pending"),
      eq(exchangeOrdersTable.status, "confirming"),
      eq(exchangeOrdersTable.status, "failed"),
      eq(exchangeOrdersTable.status, "refund_required"),
    ))
    .limit(1);

  const [hasBuyActive] = await db
    .select({ id: purchasesTable.id })
    .from(purchasesTable)
    .where(or(
      eq(purchasesTable.status, "pending"),
      eq(purchasesTable.status, "failed"),
      eq(purchasesTable.status, "refund_required"),
    ))
    .limit(1);

  if (!hasExchangeActive && !hasBuyActive) { stopRecoveryWorker(); return; }

  // ── 1. Stuck pending with fromTxHash > 3min → verify + payout ─────────────
  const pendingCutoff = new Date(Date.now() - 3 * 60 * 1000);
  const pendingStuck = await db
    .select()
    .from(exchangeOrdersTable)
    .where(and(eq(exchangeOrdersTable.status, "pending"), isNotNull(exchangeOrdersTable.fromTxHash), lt(exchangeOrdersTable.createdAt, pendingCutoff)))
    .limit(10);

  for (const order of pendingStuck) {
    if (!order.fromTxHash) continue;
    const [pair] = await db.select().from(exchangePairsTable).where(eq(exchangePairsTable.id, order.pairId)).limit(1);
    if (!pair) continue;
    logger.info({ orderId: order.id }, "Recovery: resuming stuck pending order");
    await db.update(exchangeOrdersTable).set({ status: "confirming" }).where(eq(exchangeOrdersTable.id, order.id));

    void (async () => {
      const orderId = order.id;
      try {
        const receipt = await waitForTxReceipt(getPairRpcs(pair, "from"), order.fromTxHash!);
        if (!receipt || !receipt.success) {
          await db.update(exchangeOrdersTable).set({ status: "failed", failReason: "From-chain TX failed or not found (recovery)" }).where(eq(exchangeOrdersTable.id, orderId));
          return;
        }
        // Capture fromUserAddress if not yet set
        if (!order.fromUserAddress && receipt.from) {
          await db.update(exchangeOrdersTable).set({ fromUserAddress: receipt.from }).where(eq(exchangeOrdersTable.id, orderId));
        }
        const expectedWei = ethers.parseEther(order.fromAmount);
        const tolerance = (expectedWei * 5n) / 1000n;
        if (receipt.value < expectedWei - tolerance) {
          await db.update(exchangeOrdersTable).set({ status: "failed", failReason: `Insufficient amount (recovery). Expected ~${order.fromAmount}` }).where(eq(exchangeOrdersTable.id, orderId));
          return;
        }
        await sendAndComplete(orderId, order, pair, "pending-recovery");
      } catch (err: any) {
        logger.error({ err, orderId }, "Recovery: pending order failed");
        await db.update(exchangeOrdersTable).set({ status: "failed", failReason: `Recovery failed: ${err?.message}` }).where(eq(exchangeOrdersTable.id, orderId));
      }
    })();
  }

  // ── 2. Confirming with no toTxHash > 10min → retry send ───────────────────
  const confirmingCutoff = new Date(Date.now() - 10 * 60 * 1000);
  const confirmingStuck = await db
    .select()
    .from(exchangeOrdersTable)
    .where(and(eq(exchangeOrdersTable.status, "confirming"), isNull(exchangeOrdersTable.toTxHash), lt(exchangeOrdersTable.createdAt, confirmingCutoff)))
    .limit(10);

  for (const order of confirmingStuck) {
    const [pair] = await db.select().from(exchangePairsTable).where(eq(exchangePairsTable.id, order.pairId)).limit(1);
    if (!pair) continue;
    logger.info({ orderId: order.id }, "Recovery: retrying stuck confirming order");
    void sendAndComplete(order.id, order, pair, "confirming-recovery");
  }

  // ── 3. Failed orders with retries left — retry with backoff ───────────────
  const now = new Date();
  const failedRetry = await db
    .select()
    .from(exchangeOrdersTable)
    .where(and(
      eq(exchangeOrdersTable.status, "failed"),
      lt(exchangeOrdersTable.retryCount, MAX_RETRIES),
      or(isNull(exchangeOrdersTable.nextRetryAt), lte(exchangeOrdersTable.nextRetryAt, now)),
    ))
    .limit(5);

  for (const order of failedRetry) {
    if (order.toTxHash) {
      // Payout already sent, just mark complete
      await db.update(exchangeOrdersTable).set({ status: "completed", completedAt: new Date() }).where(eq(exchangeOrdersTable.id, order.id));
      continue;
    }
    const [pair] = await db.select().from(exchangePairsTable).where(eq(exchangePairsTable.id, order.pairId)).limit(1);
    if (!pair) continue;
    logger.info({ orderId: order.id, retryCount: order.retryCount }, "Recovery: retrying failed order");
    void sendAndComplete(order.id, order, pair, `retry-${order.retryCount}`);
  }

  // ── 4. Refund required → execute refund ───────────────────────────────────
  const refundDue = await db
    .select()
    .from(exchangeOrdersTable)
    .where(and(
      eq(exchangeOrdersTable.status, "refund_required"),
      or(isNull(exchangeOrdersTable.refundStatus), eq(exchangeOrdersTable.refundStatus, "failed")),
    ))
    .limit(5);

  for (const order of refundDue) {
    const [pair] = await db.select().from(exchangePairsTable).where(eq(exchangePairsTable.id, order.pairId)).limit(1);
    if (!pair) continue;
    logger.info({ orderId: order.id }, "Recovery: executing exchange refund");
    void executeExchangeRefund(order, pair);
  }

  // ── 5. Buy recovery ────────────────────────────────────────────────────────
  await runBuyRecovery();
}

export function startOrderRecoveryWorker(): void {
  void (async () => {
    const [hasExchangeActive] = await db
      .select({ id: exchangeOrdersTable.id })
      .from(exchangeOrdersTable)
      .where(or(
        eq(exchangeOrdersTable.status, "pending"),
        eq(exchangeOrdersTable.status, "confirming"),
        eq(exchangeOrdersTable.status, "failed"),
        eq(exchangeOrdersTable.status, "refund_required"),
      ))
      .limit(1);

    const [hasBuyActive] = await db
      .select({ id: purchasesTable.id })
      .from(purchasesTable)
      .where(or(
        eq(purchasesTable.status, "pending"),
        eq(purchasesTable.status, "failed"),
        eq(purchasesTable.status, "refund_required"),
      ))
      .limit(1);

    if (hasExchangeActive || hasBuyActive) {
      ensureRecoveryWorkerRunning();
    } else {
      logger.info("Unified recovery worker skipped at startup (no active orders)");
    }
  })();
}
