import { Router, type IRouter } from "express";
import { eq, desc, asc, and, count } from "drizzle-orm";
import { db, supportConversationsTable, supportMessagesTable } from "@workspace/db";
import { requireAdmin } from "../lib/adminAuth";
import {
  StartSupportConversationBody,
  SendSupportMessageBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const StartSchema = StartSupportConversationBody;
const MessageSchema = SendSupportMessageBody;

const formatMsg = (m: typeof supportMessagesTable.$inferSelect, forAdmin = false) => ({
  id: m.id,
  conversationId: m.conversationId,
  content: m.content,
  isAdmin: m.isAdmin,
  // Only expose userSeen to admin (so admin knows if user read their message)
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

// ── User: start a new conversation ──
router.post("/support/conversations", async (req, res): Promise<void> => {
  const parsed = StartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { userName, userEmail, message } = parsed.data;

  const [conv] = await db.insert(supportConversationsTable).values({
    userName,
    userEmail,
  }).returning();

  await db.insert(supportMessagesTable).values({
    conversationId: conv.id,
    content: message,
    isAdmin: false,
    adminSeen: false,
    userSeen: false,
  });

  res.status(201).json(formatConv(conv, message));
});

// ── User: get messages for a conversation (auto-marks admin messages as userSeen) ──
router.get("/support/conversations/:id/messages", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const conv = await db.select().from(supportConversationsTable).where(eq(supportConversationsTable.id, id)).limit(1);
  if (!conv[0]) { res.status(404).json({ error: "Conversation not found" }); return; }

  // Mark all admin messages as seen by user (user is reading now)
  await db.update(supportMessagesTable)
    .set({ userSeen: true })
    .where(and(
      eq(supportMessagesTable.conversationId, id),
      eq(supportMessagesTable.isAdmin, true),
    ));

  const messages = await db.select().from(supportMessagesTable)
    .where(eq(supportMessagesTable.conversationId, id))
    .orderBy(asc(supportMessagesTable.createdAt));

  // Do NOT expose userSeen/adminSeen to user side
  res.json({ conversation: formatConv(conv[0]), messages: messages.map(m => formatMsg(m, false)) });
});

// ── User: send a message ──
router.post("/support/conversations/:id/messages", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = MessageSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const conv = await db.select().from(supportConversationsTable).where(eq(supportConversationsTable.id, id)).limit(1);
  if (!conv[0]) { res.status(404).json({ error: "Conversation not found" }); return; }

  const [msg] = await db.insert(supportMessagesTable).values({
    conversationId: id,
    content: parsed.data.content,
    isAdmin: false,
    adminSeen: false,
    userSeen: false,
  }).returning();

  res.status(201).json(formatMsg(msg, false));
});

// ── Admin: unread conversation count ──
router.get("/admin/support/unread-count", requireAdmin, async (_req, res): Promise<void> => {
  // Count distinct conversations that have at least one unread user message
  const rows = await db
    .selectDistinct({ conversationId: supportMessagesTable.conversationId })
    .from(supportMessagesTable)
    .where(and(
      eq(supportMessagesTable.isAdmin, false),
      eq(supportMessagesTable.adminSeen, false),
    ));
  res.json({ count: rows.length });
});

// ── Admin: list all conversations ──
router.get("/admin/support", requireAdmin, async (_req, res): Promise<void> => {
  const convs = await db.select().from(supportConversationsTable)
    .orderBy(desc(supportConversationsTable.updatedAt));

  const result = await Promise.all(convs.map(async (c) => {
    const [last] = await db.select().from(supportMessagesTable)
      .where(eq(supportMessagesTable.conversationId, c.id))
      .orderBy(desc(supportMessagesTable.createdAt))
      .limit(1);

    // Check if any user message is unseen by admin
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

// ── Admin: get a conversation with all messages (auto-marks user messages as adminSeen) ──
router.get("/admin/support/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [conv] = await db.select().from(supportConversationsTable).where(eq(supportConversationsTable.id, id)).limit(1);
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }

  // Mark all user messages as seen by admin
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

// ── Admin: reply to a conversation ──
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
    adminSeen: true,  // admin wrote it, so admin has seen it
    userSeen: false,  // user hasn't seen it yet
  }).returning();

  res.status(201).json(formatMsg(msg, true));
});

// ── Admin: update conversation status ──
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
