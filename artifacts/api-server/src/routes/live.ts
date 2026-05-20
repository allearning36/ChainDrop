import { Router, type IRouter } from "express";
import { requireAdmin } from "../lib/adminAuth";
import { addClient, removeClient, clientCount } from "../lib/liveEvents";

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

export default router;
