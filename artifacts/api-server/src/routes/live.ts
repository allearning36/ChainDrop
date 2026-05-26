import { Router, type IRouter } from "express";
import { and, desc, eq, gte } from "drizzle-orm";
import { requireAdmin } from "../lib/adminAuth";
import { addClient, removeClient, clientCount } from "../lib/liveEvents";
import {
  db, liveErrorLogsTable, claimsTable, chainsTable,
  purchasesTable, exchangeOrdersTable, exchangePairsTable,
} from "@workspace/db";

const router: IRouter = Router();

// ── One-time SSE tickets ──────────────────────────────────────────────────────
// EventSource cannot send custom headers, so we issue a short-lived UUID ticket
// via a normal authenticated POST, then accept that ticket once on the SSE GET.
const tickets = new Map<string, number>(); // ticket → expiry timestamp

function issueTicket(): string {
  const ticket = crypto.randomUUID();
  tickets.set(ticket, Date.now() + 30_000); // valid for 30 seconds
  return ticket;
}

function redeemTicket(ticket: string): boolean {
  const expiry = tickets.get(ticket);
  if (!expiry || Date.now() > expiry) { tickets.delete(ticket); return false; }
  tickets.delete(ticket); // one-time use
  return true;
}

// Clean up stale tickets every minute
setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of tickets) if (now > exp) tickets.delete(k);
}, 60_000);

// ── Routes ────────────────────────────────────────────────────────────────────

/** Step 1: Admin gets a short-lived SSE ticket */
router.post("/admin/live-ticket", requireAdmin, (_req, res): void => {
  res.json({ ticket: issueTicket() });
});

/** Step 2: EventSource connects with that ticket */
router.get("/admin/live", (req, res): void => {
  // Parse ticket from URL directly (Express 5 query parsing changed)
  const rawQuery = req.originalUrl.includes("?") ? req.originalUrl.split("?")[1] : "";
  const ticket = new URLSearchParams(rawQuery ?? "").get("ticket");

  if (!ticket || !redeemTicket(ticket)) {
    res.status(401).json({ error: "Invalid or expired SSE ticket" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: "connected", ts: new Date().toISOString(), clients: clientCount() + 1 })}\n\n`);

  addClient(res);

  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch { /* ignore */ }
  }, 15_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeClient(res);
  });
});

/** GET /admin/live-history — last 72h of errors + successful claims/buys/swaps merged
 *  Optional query param: ?since=<ISO timestamp> — only return events after this time (for reconnect catch-up)
 */
router.get("/admin/live-history", requireAdmin, async (req, res): Promise<void> => {
  const rawQuery = req.originalUrl.includes("?") ? req.originalUrl.split("?")[1] : "";
  const sinceParam = new URLSearchParams(rawQuery ?? "").get("since");
  const sinceDate = sinceParam ? new Date(sinceParam) : null;
  const since = (sinceDate && !isNaN(sinceDate.getTime()))
    ? sinceDate
    : new Date(Date.now() - 72 * 60 * 60 * 1000);

  const [errors, claims, chains, purchases, exchangeOrders, pairs] = await Promise.all([
    db.select().from(liveErrorLogsTable)
      .where(gte(liveErrorLogsTable.ts, since))
      .orderBy(desc(liveErrorLogsTable.ts))
      .limit(200),
    db.select().from(claimsTable)
      .where(gte(claimsTable.claimedAt, since))
      .orderBy(desc(claimsTable.claimedAt))
      .limit(200),
    db.select({ id: chainsTable.id, name: chainsTable.name, symbol: chainsTable.symbol }).from(chainsTable),
    db.select().from(purchasesTable)
      .where(and(eq(purchasesTable.status, "completed"), gte(purchasesTable.createdAt, since)))
      .orderBy(desc(purchasesTable.createdAt))
      .limit(200),
    db.select().from(exchangeOrdersTable)
      .where(and(eq(exchangeOrdersTable.status, "completed"), gte(exchangeOrdersTable.createdAt, since)))
      .orderBy(desc(exchangeOrdersTable.createdAt))
      .limit(200),
    db.select().from(exchangePairsTable),
  ]);

  const chainMap = Object.fromEntries(chains.map(c => [c.id, c]));
  const pairMap = Object.fromEntries(pairs.map(p => [p.id, p]));

  const errorEvents = errors.map(e => ({
    id: `db_err_${e.id}`,
    type: e.type,
    ts: e.ts.toISOString(),
    chainId: e.chainId ?? undefined,
    chainName: e.chainName ?? undefined,
    address: e.address ?? undefined,
    ip: e.ip ?? undefined,
    error: e.error ?? undefined,
    rootCause: e.rootCause ?? undefined,
    detail: e.detail ?? undefined,
    hint: e.hint ?? undefined,
    historical: true,
  }));

  const claimEvents = claims.map(c => ({
    id: `db_claim_${c.id}`,
    type: "claim_success" as const,
    ts: c.claimedAt.toISOString(),
    chainId: c.chainId,
    chainName: chainMap[c.chainId]?.name,
    address: c.address,
    txHash: c.txHash,
    amount: c.amount,
    symbol: chainMap[c.chainId]?.symbol,
    ip: c.ip ?? undefined,
    historical: true,
  }));

  const buyEvents = purchases.map(p => ({
    id: `db_buy_${p.id}`,
    type: "buy_success" as const,
    ts: p.createdAt.toISOString(),
    chainId: p.chainId,
    chainName: chainMap[p.chainId]?.name,
    address: p.userAddress,
    txHash: p.testnetTxHash ?? undefined,
    amount: p.testnetAmountSent ?? undefined,
    symbol: chainMap[p.chainId]?.symbol,
    historical: true,
  }));

  const swapEvents = exchangeOrders.map(o => {
    const pair = pairMap[o.pairId];
    return {
      id: `db_swap_${o.id}`,
      type: "swap_success" as const,
      ts: (o.completedAt ?? o.createdAt).toISOString(),
      address: o.userAddress,
      txHash: o.toTxHash ?? undefined,
      fromChainName: pair?.fromChainName,
      toChainName: pair?.toChainName,
      fromSymbol: pair?.fromSymbol,
      toSymbol: pair?.toSymbol,
      fromAmount: o.fromAmount,
      toAmount: o.toAmount,
      historical: true,
    };
  });

  const merged = [...errorEvents, ...claimEvents, ...buyEvents, ...swapEvents]
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 300);

  res.json(merged);
});

export default router;
