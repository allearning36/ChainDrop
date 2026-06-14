import { pgTable, text, timestamp, numeric, integer, index } from "drizzle-orm/pg-core";

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
  // Order engine — per-order deposit wallet
  depositAddress: text("deposit_address"),      // unique receive address for this order
  depositPrivateKey: text("deposit_private_key"), // encrypted — used for refund signing
  fromUserAddress: text("from_user_address"),   // tx.from on from-chain — needed for refunds
  // Order engine — retry & refund tracking
  retryCount: integer("retry_count").notNull().default(0),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  lastError: text("last_error"),
  refundTxHash: text("refund_tx_hash"),
  refundStatus: text("refund_status"), // null | 'pending' | 'completed' | 'failed'
  refundAt: timestamp("refund_at", { withTimezone: true }),
}, (t) => [
  index("idx_exchange_orders_status").on(t.status),
]);

// Status values: 'pending' | 'confirming' | 'completed' | 'failed'
//               | 'refund_required' | 'refunded' | 'expired'
