import { pgTable, text, timestamp, numeric, integer } from "drizzle-orm/pg-core";

export const exchangeOrdersTable = pgTable("exchange_orders", {
  id: text("id").primaryKey(),
  pairId: integer("pair_id").notNull(),
  userAddress: text("user_address").notNull(),
  fromAmount: numeric("from_amount", { precision: 18, scale: 8 }).notNull(),
  feeAmount: numeric("fee_amount", { precision: 18, scale: 8 }).notNull(),
  toAmount: numeric("to_amount", { precision: 18, scale: 8 }).notNull(),
  status: text("status").notNull().default("pending"),
  fromTxHash: text("from_tx_hash"),
  toTxHash: text("to_tx_hash"),
  failReason: text("fail_reason"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
