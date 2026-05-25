import { Router, type IRouter } from "express";
import { eq, desc, asc, and, count } from "drizzle-orm";
import { db, supportConversationsTable, supportMessagesTable } from "@workspace/db";
import { requireAdmin } from "../lib/adminAuth";
import {
  StartSupportConversationBody,
  SendSupportMessageBody,
} from "@workspace/api-zod";
import { supportLimiter } from "../lib/rateLimiters";

const router: IRouter = Router();

// ── SSE registry: convId → Set of send callbacks ──────────────────────────────
const sseClients = new Map<number, Set<(payload: string) => void>>();

function notifyConvUser(convId: number, data: object) {
  const listeners = sseClients.get(convId);
  if (!listeners || listeners.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  listeners.forEach(send => send(payload));
}

const StartSchema = StartSupportConversationBody;
const MessageSchema = SendSupportMessageBody;

const formatMsg = (m: typeof supportMessagesTable.$inferSelect, forAdmin = false) => ({
  id: m.id,
  conversationId: m.conversationId,
  content: m.content,
  isAdmin: m.isAdmin,
  ...(forAdmin ? { userSeen: m.userSeen } : {}),
  createdAt: m.createdAt.toISOString(),
});

const formatConv = (
  c: typeof supportConversationsTable.$inferSelect,
  lastMessage?: string,
  hasUnread?: boolean,
) => ({
  id: c.id,
  userName: c.userName,
  userEmail: c.userEmail,
  status: c.status,
  lastMessage: lastMessage ?? null,
  hasUnread: hasUnread ?? false,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});

// ── Helper: validate user token from header ───────────────────────────────────
async function validateUserToken(convId: number, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [conv] = await db.select({ userToken: supportConversationsTable.userToken })
    .from(supportConversationsTable)
    .where(eq(supportConversationsTable.id, convId))
    .limit(1);
  if (!conv) return false;
  // If no token stored (legacy rows), allow access
  if (!conv.userToken) return true;
  return conv.userToken === token;
}

// ── User: start a new conversation ──────────────────────────────────────────
router.post("/support/conversations", supportLimiter, async (req, res): Promise<void> => {
  const parsed = StartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { userName, userEmail, message } = parsed.data;

  const userToken = crypto.randomUUID();

  const [conv] = await db.insert(supportConversationsTable).values({
    userName,
    userEmail,
    userToken,
  }).returning();

  await db.insert(supportMessagesTable).values({
    conversationId: conv.id,
    content: message,
    isAdmin: false,
    adminSeen: false,
    userSeen: false,
  });

  // Return userToken to client — they must store and send it on subsequent requests
  res.status(201).json({ ...formatConv(conv, message), userToken });
});

// ── User: get messages ────────────────────────────────────────────────────────
router.get("/support/conversations/:id/messages", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const token = req.headers["x-user-token"] as string | undefined;
  if (!await validateUserToken(id, token)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  const [conv] = await db.select().from(supportConversationsTable).where(eq(supportConversationsTable.id, id)).limit(1);
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

  await db.update(supportMessagesTable)
    .set({ userSeen: true })
    .where(and(
      eq(supportMessagesTable.conversationId, id),
      eq(supportMessagesTable.isAdmin, true),
    ));

  const messages = await db.select().from(supportMessagesTable)
    .where(eq(supportMessagesTable.conversationId, id))
    .orderBy(asc(supportMessagesTable.createdAt));

  res.json({ conversation: formatConv(conv), messages: messages.map(m => formatMsg(m, false)) });
});

// ── User: send a message ──────────────────────────────────────────────────────
router.post("/support/conversations/:id/messages", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const token = req.headers["x-user-token"] as string | undefined;
  if (!await validateUserToken(id, token)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  const parsed = MessageSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const [conv] = await db.select().from(supportConversationsTable).where(eq(supportConversationsTable.id, id)).limit(1);
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

  const [msg] = await db.insert(supportMessagesTable).values({
    conversationId: id,
    content: parsed.data.content,
    isAdmin: false,
    adminSeen: false,
    userSeen: false,
  }).returning();

  res.status(201).json(formatMsg(msg, false));
});

// ── User: SSE stream for instant admin-reply notifications ───────────────────
router.get("/support/conversations/:id/stream", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).end(); return; }

  const token = req.query.token as string | undefined;
  if (!await validateUserToken(id, token)) {
    res.status(403).end();
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(": connected\n\n");

  const send = (payload: string) => { try { res.write(payload); } catch { /* client gone */ } };

  if (!sseClients.has(id)) sseClients.set(id, new Set());
  sseClients.get(id)!.add(send);

  const heartbeat = setInterval(() => { try { res.write(": ping\n\n"); } catch { /* ignore */ } }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.get(id)?.delete(send);
    if (sseClients.get(id)?.size === 0) sseClients.delete(id);
  });
});

// ── User: check unread admin replies ─────────────────────────────────────────
router.get("/support/conversations/:id/unread", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const token = req.headers["x-user-token"] as string | undefined;
  if (!await validateUserToken(id, token)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  const [row] = await db
    .select({ cnt: count() })
    .from(supportMessagesTable)
    .where(and(
      eq(supportMessagesTable.conversationId, id),
      eq(supportMessagesTable.isAdmin, true),
      eq(supportMessagesTable.userSeen, false),
    ));
  res.json({ count: Number(row?.cnt ?? 0) });
});

// ── User: restore conversation by token ───────────────────────────────────────
router.get("/support/restore", async (req, res): Promise<void> => {
  const rawConvId = req.query.convId;
  const token = req.query.token as string | undefined;
  const id = parseInt(String(rawConvId ?? ""));
  if (isNaN(id) || !token) { res.status(400).json({ error: "convId and token required" }); return; }
  if (!await validateUserToken(id, token)) {
    res.status(403).json({ error: "Invalid recovery key" });
    return;
  }
  const [conv] = await db.select().from(supportConversationsTable).where(eq(supportConversationsTable.id, id)).limit(1);
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
  res.json({ id: conv.id, userName: conv.userName, userEmail: conv.userEmail, status: conv.status });
});

// ── Admin: unread conversation count ─────────────────────────────────────────
router.get("/admin/support/unread-count", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ conversationId: supportMessagesTable.conversationId })
    .from(supportMessagesTable)
    .where(and(
      eq(supportMessagesTable.isAdmin, false),
      eq(supportMessagesTable.adminSeen, false),
    ));
  res.json({ count: rows.length });
});

// ── Admin: list all conversations ─────────────────────────────────────────────
router.get("/admin/support", requireAdmin, async (_req, res): Promise<void> => {
  const convs = await db.select().from(supportConversationsTable)
    .orderBy(desc(supportConversationsTable.updatedAt));

  const result = await Promise.all(convs.map(async (c) => {
    const [last] = await db.select().from(supportMessagesTable)
      .where(eq(supportMessagesTable.conversationId, c.id))
      .orderBy(desc(supportMessagesTable.createdAt))
      .limit(1);

    const [unreadRow] = await db
      .select({ cnt: count() })
      .from(supportMessagesTable)
      .where(and(
        eq(supportMessagesTable.conversationId, c.id),
        eq(supportMessagesTable.isAdmin, false),
        eq(supportMessagesTable.adminSeen, false),
      ));
    const hasUnread = (unreadRow?.cnt ?? 0) > 0;

    return formatConv(c, last?.content, hasUnread);
  }));

  res.json(result);
});

// ── Admin: get a conversation with messages ───────────────────────────────────
router.get("/admin/support/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [conv] = await db.select().from(supportConversationsTable).where(eq(supportConversationsTable.id, id)).limit(1);
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }

  await db.update(supportMessagesTable)
    .set({ adminSeen: true })
    .where(and(
      eq(supportMessagesTable.conversationId, id),
      eq(supportMessagesTable.isAdmin, false),
    ));

  const messages = await db.select().from(supportMessagesTable)
    .where(eq(supportMessagesTable.conversationId, id))
    .orderBy(asc(supportMessagesTable.createdAt));

  res.json({ ...formatConv(conv), messages: messages.map(m => formatMsg(m, true)) });
});

// ── Admin: reply to a conversation ───────────────────────────────────────────
router.post("/admin/support/:id/reply", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = MessageSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const [conv] = await db.select().from(supportConversationsTable).where(eq(supportConversationsTable.id, id)).limit(1);
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }

  const [msg] = await db.insert(supportMessagesTable).values({
    conversationId: id,
    content: parsed.data.content,
    isAdmin: true,
    adminSeen: true,
    userSeen: false,
  }).returning();

  // Push instant notification to user if they have an open SSE stream
  notifyConvUser(id, { type: "new_reply", messageId: msg.id });

  res.status(201).json(formatMsg(msg, true));
});

// ── Admin: update conversation status ────────────────────────────────────────
router.patch("/admin/support/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { status } = req.body as { status?: string };
  if (!status || !["open", "closed"].includes(status)) {
    res.status(400).json({ error: "status must be 'open' or 'closed'" });
    return;
  }

  const [updated] = await db.update(supportConversationsTable)
    .set({ status })
    .where(eq(supportConversationsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatConv(updated));
});

export default router;
