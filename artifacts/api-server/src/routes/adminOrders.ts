import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  purchasesTable, exchangeOrdersTable, exchangePairsTable,
  chainsTable, paymentNetworksTable, orderEventsTable, settingsTable,
} from "@workspace/db/schema";
import { eq, and, or, desc, isNull } from "drizzle-orm";
import { requireAdmin } from "../lib/adminAuth";
import { logOrderEvent } from "../lib/orderEvents";
import { getAllKillSwitches, setKillSwitch } from "../lib/killSwitch";
import { logger } from "../lib/logger";
import { sendTokens } from "../lib/faucet";
import { resolveChainPrivateKey } from "../lib/encryption";
import { decryptPrivateKey } from "../lib/encryption";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Kill Switches
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/kill-switches", requireAdmin, async (_req, res): Promise<void> => {
  const ks = await getAllKillSwitches();
  // Also return chain list for per-chain controls
  const chains = await db.select({ id: chainsTable.id, name: chainsTable.name, symbol: chainsTable.symbol, buyEnabled: chainsTable.buyEnabled }).from(chainsTable).where(eq(chainsTable.isEnabled, true)).orderBy(chainsTable.name);
  res.json({
    buy: ks.buy,
    exchange: ks.exchange,
    chains: chains.map(c => ({
      id: c.id,
      name: c.name,
      symbol: c.symbol,
      buyEnabled: c.buyEnabled,
      killed: ks.chains[String(c.id)] ?? false,
    })),
  });
});

router.post("/admin/kill-switches", requireAdmin, async (req, res): Promise<void> => {
  const { buy, exchange, chainId, chainKilled } = req.body ?? {};
  if (typeof buy === "boolean") await setKillSwitch("kill:buy", buy);
  if (typeof exchange === "boolean") await setKillSwitch("kill:exchange", exchange);
  if (typeof chainId === "number" && typeof chainKilled === "boolean") {
    await setKillSwitch(`kill:chain:${chainId}`, chainKilled);
  }
  const ks = await getAllKillSwitches();
  res.json({ ok: true, ...ks });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Refund Dashboard — list all orders needing attention
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/orders/refunds", requireAdmin, async (_req, res): Promise<void> => {
  const [buyOrders, exchangeOrders] = await Promise.all([
    db.select({
      id: purchasesTable.id,
      userAddress: purchasesTable.userAddress,
      fromUserAddress: purchasesTable.fromUserAddress,
      networkId: purchasesTable.networkId,
      mainnetAmountPaid: purchasesTable.mainnetAmountPaid,
      mainnetTxHash: purchasesTable.mainnetTxHash,
      testnetTxHash: purchasesTable.testnetTxHash,
      status: purchasesTable.status,
      retryCount: purchasesTable.retryCount,
      lastError: purchasesTable.lastError,
      refundStatus: purchasesTable.refundStatus,
      refundTxHash: purchasesTable.refundTxHash,
      refundAt: purchasesTable.refundAt,
      createdAt: purchasesTable.createdAt,
      chainName: chainsTable.name,
      chainSymbol: chainsTable.symbol,
      networkName: paymentNetworksTable.name,
      networkSymbol: paymentNetworksTable.symbol,
    })
    .from(purchasesTable)
    .leftJoin(chainsTable, eq(purchasesTable.chainId, chainsTable.id))
    .leftJoin(paymentNetworksTable, eq(purchasesTable.networkId, paymentNetworksTable.networkId))
    .where(or(
      eq(purchasesTable.status, "refund_required"),
      eq(purchasesTable.status, "refunded"),
      and(eq(purchasesTable.status, "failed"), isNull(purchasesTable.testnetTxHash)),
    ))
    .orderBy(desc(purchasesTable.createdAt))
    .limit(100),

    db.select({
      id: exchangeOrdersTable.id,
      userAddress: exchangeOrdersTable.userAddress,
      fromUserAddress: exchangeOrdersTable.fromUserAddress,
      depositAddress: exchangeOrdersTable.depositAddress,
      fromAmount: exchangeOrdersTable.fromAmount,
      toAmount: exchangeOrdersTable.toAmount,
      fromTxHash: exchangeOrdersTable.fromTxHash,
      toTxHash: exchangeOrdersTable.toTxHash,
      status: exchangeOrdersTable.status,
      retryCount: exchangeOrdersTable.retryCount,
      failReason: exchangeOrdersTable.failReason,
      lastError: exchangeOrdersTable.lastError,
      refundStatus: exchangeOrdersTable.refundStatus,
      refundTxHash: exchangeOrdersTable.refundTxHash,
      refundAt: exchangeOrdersTable.refundAt,
      createdAt: exchangeOrdersTable.createdAt,
      fromChainName: exchangePairsTable.fromChainName,
      fromSymbol: exchangePairsTable.fromSymbol,
      toChainName: exchangePairsTable.toChainName,
      toSymbol: exchangePairsTable.toSymbol,
    })
    .from(exchangeOrdersTable)
    .leftJoin(exchangePairsTable, eq(exchangeOrdersTable.pairId, exchangePairsTable.id))
    .where(or(
      eq(exchangeOrdersTable.status, "refund_required"),
      eq(exchangeOrdersTable.status, "refunded"),
      eq(exchangeOrdersTable.status, "failed"),
    ))
    .orderBy(desc(exchangeOrdersTable.createdAt))
    .limit(100),
  ]);

  res.json({
    buy: buyOrders.map(r => ({ ...r, orderType: "FAUCET_BUY", createdAt: r.createdAt.toISOString(), refundAt: r.refundAt?.toISOString() ?? null })),
    exchange: exchangeOrders.map(r => ({ ...r, orderType: "CROSS_CHAIN_SWAP", createdAt: r.createdAt.toISOString(), refundAt: r.refundAt?.toISOString() ?? null })),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Manual refund trigger — Buy
// ─────────────────────────────────────────────────────────────────────────────

router.post("/admin/orders/buy/:id/refund", requireAdmin, async (req, res): Promise<void> => {
  const purchaseId = parseInt(String(req.params.id));
  const [purchase] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, purchaseId)).limit(1);
  if (!purchase) { res.status(404).json({ error: "Purchase not found" }); return; }
  if (!["refund_required", "failed"].includes(purchase.status)) {
    res.status(400).json({ error: `Cannot refund purchase with status ${purchase.status}` }); return;
  }
  if (!purchase.fromUserAddress) {
    res.status(400).json({ error: "No fromUserAddress recorded — cannot auto-refund. Send manually." }); return;
  }

  const [chain] = await db.select().from(chainsTable).where(eq(chainsTable.id, purchase.chainId)).limit(1);
  if (!chain) { res.status(400).json({ error: "Chain not found" }); return; }

  const allNetworks = await db.select().from(paymentNetworksTable);
  const network = allNetworks.find(n => n.networkId === purchase.networkId);
  if (!network) { res.status(400).json({ error: "Payment network not found" }); return; }

  const GAS_BUFFER = 0.0005;
  const refundAmount = (parseFloat(purchase.mainnetAmountPaid) - GAS_BUFFER).toFixed(8);
  if (parseFloat(refundAmount) <= 0) { res.status(400).json({ error: "Amount too small to refund" }); return; }

  try {
    await db.update(purchasesTable).set({ refundStatus: "pending", status: "refund_required" }).where(eq(purchasesTable.id, purchaseId));
    const privateKey = resolveChainPrivateKey(chain.privateKey);
    const { txHash } = await sendTokens(network.rpcUrl, privateKey, purchase.fromUserAddress, refundAmount);
    await db.update(purchasesTable)
      .set({ status: "refunded", refundStatus: "completed", refundTxHash: txHash, refundAt: new Date() })
      .where(eq(purchasesTable.id, purchaseId));
    await logOrderEvent({ orderType: "FAUCET_BUY", orderId: String(purchaseId), event: "refund_sent", oldStatus: purchase.status, newStatus: "refunded", txHash, metadata: { admin: true, refundAmount } });
    res.json({ ok: true, txHash, refundAmount });
  } catch (err: any) {
    await db.update(purchasesTable).set({ refundStatus: "failed", lastError: err?.message }).where(eq(purchasesTable.id, purchaseId));
    await logOrderEvent({ orderType: "FAUCET_BUY", orderId: String(purchaseId), event: "refund_failed", error: err?.message, metadata: { admin: true } });
    res.status(500).json({ error: `Refund failed: ${err?.message}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Manual refund trigger — Exchange
// ─────────────────────────────────────────────────────────────────────────────

router.post("/admin/orders/exchange/:id/refund", requireAdmin, async (req, res): Promise<void> => {
  const orderId = String(req.params.id);
  const [order] = await db.select().from(exchangeOrdersTable).where(eq(exchangeOrdersTable.id, orderId)).limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (!["refund_required", "failed"].includes(order.status)) {
    res.status(400).json({ error: `Cannot refund order with status ${order.status}` }); return;
  }

  const [pair] = await db.select().from(exchangePairsTable).where(eq(exchangePairsTable.id, order.pairId)).limit(1);
  if (!pair) { res.status(400).json({ error: "Exchange pair not found" }); return; }

  if (!order.depositPrivateKey || !order.fromUserAddress) {
    res.status(400).json({ error: "Missing deposit key or fromUserAddress. Send refund manually." }); return;
  }

  const pk = decryptPrivateKey(order.depositPrivateKey);
  const fromRpcUrls = [pair.fromRpcUrl, ...(pair.fromRpcUrls ? pair.fromRpcUrls.split(",").map((r: string) => r.trim()).filter(Boolean) : [])];

  // Get balance of deposit wallet
  let balance: string | null = null;
  for (const rpc of fromRpcUrls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getBalance", params: [order.depositAddress, "latest"], id: 1 }), signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) continue;
      const { result } = await resp.json() as { result?: string };
      if (result) { const { ethers } = await import("ethers"); balance = ethers.formatEther(BigInt(result)); break; }
    } catch { /* try next */ }
  }

  if (!balance || parseFloat(balance) <= 0.001) {
    res.status(400).json({ error: `Deposit wallet balance too low to refund: ${balance ?? "unknown"} ETH` });
    return;
  }

  const refundAmount = (parseFloat(balance) - 0.001).toFixed(8);

  try {
    await db.update(exchangeOrdersTable).set({ refundStatus: "pending", status: "refund_required" }).where(eq(exchangeOrdersTable.id, orderId));
    const { txHash } = await sendTokens(fromRpcUrls[0]!, pk, order.fromUserAddress, refundAmount, pair.gasLimit);
    await db.update(exchangeOrdersTable).set({ status: "refunded", refundStatus: "completed", refundTxHash: txHash, refundAt: new Date() }).where(eq(exchangeOrdersTable.id, orderId));
    await logOrderEvent({ orderType: "CROSS_CHAIN_SWAP", orderId, event: "refund_sent", oldStatus: order.status, newStatus: "refunded", txHash, metadata: { admin: true, refundAmount } });
    res.json({ ok: true, txHash, refundAmount });
  } catch (err: any) {
    await db.update(exchangeOrdersTable).set({ refundStatus: "failed", lastError: err?.message }).where(eq(exchangeOrdersTable.id, orderId));
    await logOrderEvent({ orderType: "CROSS_CHAIN_SWAP", orderId, event: "refund_failed", error: err?.message, metadata: { admin: true } });
    res.status(500).json({ error: `Refund failed: ${err?.message}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Order Events (Audit Log)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/order-events", requireAdmin, async (req, res): Promise<void> => {
  const orderId = req.query.orderId as string | undefined;
  const orderType = req.query.orderType as string | undefined;
  const limit = Math.min(parseInt(String(req.query.limit ?? "100")), 500);

  let query = db.select().from(orderEventsTable).$dynamic();
  if (orderId) query = query.where(eq(orderEventsTable.orderId, orderId));
  else if (orderType) query = query.where(eq(orderEventsTable.orderType, orderType));

  const events = await query.orderBy(desc(orderEventsTable.createdAt)).limit(limit);
  res.json(events.map(e => ({ ...e, createdAt: e.createdAt.toISOString() })));
});

export default router;
