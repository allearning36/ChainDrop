import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const ipBlocksTable = pgTable("ip_blocks", {
  ip: text("ip").primaryKey(),
  reason: text("reason").notNull().default(""),
  blockedAt: timestamp("blocked_at", { withTimezone: true }).notNull().defaultNow(),
});

export type IpBlock = typeof ipBlocksTable.$inferSelect;
