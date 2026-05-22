import { Router } from "express";
import { ethers } from "ethers";
import { db } from "@workspace/db";
import { exchangePairsTable, exchangeOrdersTable, settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendTokens } from "../lib/faucet";
import { requireAdmin } from "../lib/adminAuth";
import { parseRpcUrls, checkRpcHealth } from "../lib/rpcFailover";
import { randomUUID } from "crypto";
import { encryptPrivateKey, decryptPrivateKey } from "../lib/encryption";

const router = Router();

const SYSTEM_PRIVATE_KEY = process.env.FAUCET_PRIVATE_KEY ?? "";

// ── Resolve which private key to use for a pair ───────────────────────────────
async function resolvePrivateKey(pair: { pairPrivateKey?: string | null }): Promise<string> {
  if (pair.pairPrivateKey?.trim()) return decryptPrivateKey(pair.pairPrivateKey.trim());
  // Try settings table for default exchange key
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

// ── Poll for TX receipt via JSON-RPC (with failover) ─────────────────────────
async function waitForTxReceipt(
  rpcUrls: string[],
  txHash: string,
  maxAttempts = 60,   // up to ~2 min at 2s intervals
  intervalMs = 2000,  // poll every 2s (was 4s) — faster for Base / Arbitrum
): Promise<{ success: boolean; to: string; value: bigint } | null> {
  const rpc = rpcUrls[0]!;
  for (let i = 0; i < maxAttempts; i++) {
    // Check FIRST, then wait — first confirmation can arrive in <2s on Base
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash],
        }),
      });
      const json = await res.json() as any;
      if (json.result?.blockNumber) {
        const txRes = await fetch(rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 2, method: "eth_getTransactionByHash", params: [txHash],
          }),
        });
        const txJson = await txRes.json() as any;
        return {
          success: json.result.status === "0x1",
          to: (txJson.result?.to ?? "").toLowerCase(),
          value: BigInt(txJson.result?.value ?? "0x0"),
        };
      }
    } catch { /* keep polling */ }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}

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
// PUBLIC: GET /exchange/pairs/:id/wallet-balance  — check exchange wallet balance for a pair
// Frontend uses this before initiating to warn user if wallet is low
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
    // GAS_RESERVE: same buffer used in order creation pre-check
    const GAS_RESERVE = 0.002;
    // warning = true when balance is null OR balance cannot cover minAmount + gas
    const warning = balance === null || parseFloat(balance) < parseFloat(pair.minAmount) + GAS_RESERVE;
    res.json({ balance, address, warning, gasReserve: GAS_RESERVE });
  } catch {
    res.json({ balance: null, address: null, warning: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: POST /exchange/orders — initiate swap order
// ─────────────────────────────────────────────────────────────────────────────
router.post("/exchange/orders", async (req, res): Promise<void> => {
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

  // Pre-check: exchange wallet balance — HARD BLOCK (never skip)
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
    res.status(503).json({ error: `Cannot verify exchange wallet balance on ${pair.toChainName}. The destination chain RPC may be unavailable. Please try again later.` });
    return;
  }
  // GAS_RESERVE: conservative estimate for gas fees on the destination chain
  // (21000 gas × ~50 gwei ≈ 0.00105 ETH; 0.002 gives extra headroom)
  const GAS_RESERVE = 0.002;
  if (parseFloat(balance) < toAmt + GAS_RESERVE) {
    res.status(503).json({
      error: `Low liquidity — exchange wallet balance insufficient on ${pair.toChainName}. Available: ${parseFloat(balance).toFixed(6)} ${pair.toSymbol} (need ${(toAmt + GAS_RESERVE).toFixed(6)} including gas). Please try a smaller amount or contact support.`,
      code: "LOW_LIQUIDITY",
    });
    return;
  }

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
  });

  res.json({
    orderId: id,
    depositAddress: pair.fromDepositAddress,
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
        return;
      }

      if (receipt.to !== pair.fromDepositAddress.toLowerCase()) {
        await db.update(exchangeOrdersTable).set({ status: "failed", failReason: "TX sent to wrong address" }).where(eq(exchangeOrdersTable.id, orderId));
        return;
      }

      const expectedWei = ethers.parseEther(order.fromAmount);
      const tolerance = (expectedWei * 5n) / 1000n;
      if (receipt.value < expectedWei - tolerance) {
        await db.update(exchangeOrdersTable).set({ status: "failed", failReason: `Insufficient amount sent. Expected ~${order.fromAmount} ${pair.fromSymbol}` }).where(eq(exchangeOrdersTable.id, orderId));
        return;
      }

      const privateKey = await resolvePrivateKey(pair);
      if (!privateKey) {
        await db.update(exchangeOrdersTable).set({ status: "failed", failReason: "Exchange wallet not configured" }).where(eq(exchangeOrdersTable.id, orderId));
        return;
      }

      // Send toToken — try all fallback RPCs
      const toRpcs = getPairRpcs(pair, "to");
      const { txHash: toTxHash } = await sendTokensWithFallback(toRpcs, privateKey, order.userAddress, order.toAmount, pair.gasLimit);
      await db.update(exchangeOrdersTable).set({
        status: "completed",
        toTxHash,
        completedAt: new Date(),
      }).where(eq(exchangeOrdersTable.id, orderId));
      logger.info({ orderId, fromTxHash, toTxHash }, "Exchange order completed");
    } catch (err: any) {
      logger.error({ err, orderId }, "Exchange order failed");
      await db.update(exchangeOrdersTable).set({ status: "failed", failReason: err?.message ?? "Unexpected error" }).where(eq(exchangeOrdersTable.id, orderId));
    }
  })();
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /exchange/orders/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get("/exchange/orders/:id", async (req, res): Promise<void> => {
  const [order] = await db.select().from(exchangeOrdersTable).where(eq(exchangeOrdersTable.id, req.params.id)).limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(order);
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Exchange Settings (default private key)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/exchange/settings", requireAdmin, async (_req, res): Promise<void> => {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "exchange_default_private_key")).limit(1);
  const key = row?.value?.trim() || SYSTEM_PRIVATE_KEY;
  const address = deriveAddress(key);
  res.json({
    hasCustomKey: !!(row?.value?.trim()),
    walletAddress: address,
    // We never return the actual key — just the derived address
  });
});

router.put("/admin/exchange/settings", requireAdmin, async (req, res): Promise<void> => {
  const { defaultPrivateKey } = req.body ?? {};
  if (typeof defaultPrivateKey !== "string") {
    res.status(400).json({ error: "defaultPrivateKey is required" }); return;
  }
  const trimmed = defaultPrivateKey.trim();
  if (trimmed && !deriveAddress(trimmed)) {
    res.status(400).json({ error: "Invalid private key — could not derive wallet address" }); return;
  }
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
// ADMIN: Pair wallet balance check
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
  const orders = await db.select().from(exchangeOrdersTable).orderBy(exchangeOrdersTable.createdAt).limit(100);
  // Auto-expire stale pending orders past their expiry time
  const now = new Date();
  const staleIds = orders
    .filter(o => o.status === "pending" && new Date(o.expiresAt) < now)
    .map(o => o.id);
  if (staleIds.length > 0) {
    await Promise.all(
      staleIds.map(id =>
        db.update(exchangeOrdersTable).set({ status: "expired" }).where(eq(exchangeOrdersTable.id, id))
      )
    );
    orders.forEach(o => { if (staleIds.includes(o.id)) o.status = "expired"; });
  }
  res.json(orders.reverse());
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Retry failed order
// ─────────────────────────────────────────────────────────────────────────────
router.post("/admin/exchange/orders/:id/retry", requireAdmin, async (req, res): Promise<void> => {
  const orderId = String(req.params.id);
  const [order] = await db.select().from(exchangeOrdersTable).where(eq(exchangeOrdersTable.id, orderId)).limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  if (order.status !== "failed") {
    res.status(400).json({ error: `Cannot retry order with status "${order.status}". Only failed orders can be retried.` });
    return;
  }
  if (!order.fromTxHash) {
    res.status(400).json({ error: "Order has no fromTxHash — user may not have sent funds." });
    return;
  }

  const [pair] = await db.select().from(exchangePairsTable).where(eq(exchangePairsTable.id, order.pairId)).limit(1);
  if (!pair) { res.status(404).json({ error: "Exchange pair no longer exists." }); return; }

  const privateKey = await resolvePrivateKey(pair);
  if (!privateKey) {
    res.status(500).json({ error: "Exchange wallet private key not configured." });
    return;
  }

  await db.update(exchangeOrdersTable)
    .set({ status: "confirming", failReason: null })
    .where(eq(exchangeOrdersTable.id, orderId));

  res.json({ status: "retrying", message: "Retry started — sending toToken now." });

  void (async () => {
    try {
      const toRpcs = getPairRpcs(pair, "to");
      const { txHash: toTxHash } = await sendTokensWithFallback(toRpcs, privateKey, order.userAddress, order.toAmount, pair.gasLimit);
      await db.update(exchangeOrdersTable).set({
        status: "completed",
        toTxHash,
        completedAt: new Date(),
        failReason: null,
      }).where(eq(exchangeOrdersTable.id, orderId));
      logger.info({ orderId, toTxHash }, "Exchange order completed via admin retry");
    } catch (err: any) {
      logger.error({ err, orderId }, "Admin retry failed");
      await db.update(exchangeOrdersTable).set({
        status: "failed",
        failReason: `Retry failed: ${err?.message ?? "Unexpected error"}`,
      }).where(eq(exchangeOrdersTable.id, orderId));
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
