import { pgTable, serial, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const orderEventsTable = pgTable("order_events", {
  id: serial("id").primaryKey(),
  orderType: text("order_type").notNull(), // 'FAUCET_BUY' | 'CROSS_CHAIN_SWAP'
  orderId: text("order_id").notNull(),
  event: text("event").notNull(),
  // event values: 'created' | 'status_changed' | 'payout_sent' | 'retry_attempt'
  //               | 'refund_initiated' | 'refund_sent' | 'refund_failed' | 'kill_switch'
  oldStatus: text("old_status"),
  newStatus: text("new_status"),
  txHash: text("tx_hash"),
  error: text("error"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_order_events_order_id").on(t.orderId),
  index("idx_order_events_type_created").on(t.orderType, t.createdAt),
  index("idx_order_events_created").on(t.createdAt),
]);

export type OrderEvent = typeof orderEventsTable.$inferSelect;
