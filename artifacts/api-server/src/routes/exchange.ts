import { Router } from "express";
import { ethers } from "ethers";
import { db } from "@workspace/db";
import { exchangePairsTable, exchangeOrdersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendTokens } from "../lib/faucet";
import { requireAdmin } from "../lib/adminAuth";
import { randomUUID } from "crypto";

const router = Router();

const PRIVATE_KEY = process.env.FAUCET_PRIVATE_KEY ?? "";

// ── Poll for TX receipt via JSON-RPC ─────────────────────────────────────────
async function waitForTxReceipt(
  rpcUrl: string,
  txHash: string,
  maxAttempts = 40,
  intervalMs = 4000,
): Promise<{ success: boolean; to: string; value: bigint } | null> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash],
        }),
      });
      const json = await res.json() as any;
      if (json.result?.blockNumber) {
        const txRes = await fetch(rpcUrl, {
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
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /exchange/pairs
// ─────────────────────────────────────────────────────────────────────────────
router.get("/exchange/pairs", async (_req, res): Promise<void> => {
  const pairs = await db.select().from(exchangePairsTable).where(eq(exchangePairsTable.isEnabled, true));
  res.json(pairs);
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

  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

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
// PUBLIC: POST /exchange/orders/:id/confirm — user submits fromTxHash
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

  // Mark as confirming
  await db.update(exchangeOrdersTable).set({ status: "confirming", fromTxHash }).where(eq(exchangeOrdersTable.id, orderId));
  res.json({ status: "confirming", message: "TX received — verifying on-chain…" });

  // Background: verify TX + send toToken
  void (async () => {
    try {
      const receipt = await waitForTxReceipt(pair.fromRpcUrl, fromTxHash);
      if (!receipt || !receipt.success) {
        await db.update(exchangeOrdersTable).set({ status: "failed", failReason: "From-chain TX failed or not found" }).where(eq(exchangeOrdersTable.id, orderId));
        return;
      }

      // Verify recipient
      if (receipt.to !== pair.fromDepositAddress.toLowerCase()) {
        await db.update(exchangeOrdersTable).set({ status: "failed", failReason: "TX sent to wrong address" }).where(eq(exchangeOrdersTable.id, orderId));
        return;
      }

      // Verify amount (allow 0.5% tolerance for gas estimation differences)
      const expectedWei = ethers.parseEther(order.fromAmount);
      const tolerance = (expectedWei * 5n) / 1000n;
      if (receipt.value < expectedWei - tolerance) {
        await db.update(exchangeOrdersTable).set({ status: "failed", failReason: `Insufficient amount sent. Expected ~${order.fromAmount} ${pair.fromSymbol}` }).where(eq(exchangeOrdersTable.id, orderId));
        return;
      }

      if (!PRIVATE_KEY) {
        await db.update(exchangeOrdersTable).set({ status: "failed", failReason: "Exchange wallet not configured" }).where(eq(exchangeOrdersTable.id, orderId));
        return;
      }

      // Send toToken
      const { txHash: toTxHash } = await sendTokens(pair.toRpcUrl, PRIVATE_KEY, order.userAddress, order.toAmount);
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
// PUBLIC: GET /exchange/orders/:id — poll order status
// ─────────────────────────────────────────────────────────────────────────────
router.get("/exchange/orders/:id", async (req, res): Promise<void> => {
  const [order] = await db.select().from(exchangeOrdersTable).where(eq(exchangeOrdersTable.id, req.params.id)).limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(order);
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
  }).returning();
  res.status(201).json(pair);
});

router.put("/admin/exchange/pairs/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const body = req.body ?? {};
  const update: Record<string, unknown> = { ...body };
  if (update.fromChainId !== undefined) update.fromChainId = Number(update.fromChainId);
  if (update.toChainId !== undefined) update.toChainId = Number(update.toChainId);
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
  res.json(orders.reverse());
});

export default router;
