import { Router, type IRouter } from "express";
import { requireAdmin } from "../lib/adminAuth";
import { addClient, removeClient, clientCount } from "../lib/liveEvents";

const router: IRouter = Router();

router.get("/admin/live", requireAdmin, (req, res): void => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
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
