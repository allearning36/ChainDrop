import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const supportConversationsTable = pgTable("support_conversations", {
  id: serial("id").primaryKey(),
  userName: text("user_name").notNull(),
  userEmail: text("user_email").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const supportMessagesTable = pgTable("support_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => supportConversationsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SupportConversation = typeof supportConversationsTable.$inferSelect;
export type SupportMessage = typeof supportMessagesTable.$inferSelect;
