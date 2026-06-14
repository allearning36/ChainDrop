-- Migration 0003: order engine — retry/refund tracking + per-order deposit wallets + audit log
-- All statements use IF NOT EXISTS to be safe against any DB state.

-- ── purchases: add order engine columns ───────────────────────────────────────
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "retry_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "next_retry_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "last_error" text;
--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "refund_tx_hash" text;
--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "refund_status" text;
--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "refund_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "from_user_address" text;
--> statement-breakpoint

-- ── exchange_orders: add order engine + deposit wallet columns ────────────────
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "deposit_address" text;
--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "deposit_private_key" text;
--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "from_user_address" text;
--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "retry_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "next_retry_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "last_error" text;
--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "refund_tx_hash" text;
--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "refund_status" text;
--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "refund_at" timestamp with time zone;
--> statement-breakpoint

-- ── order_events: new audit log table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "order_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_type" text NOT NULL,
  "order_id" text NOT NULL,
  "event" text NOT NULL,
  "old_status" text,
  "new_status" text,
  "tx_hash" text,
  "error" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_order_events_order_id" ON "order_events" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_events_type_created" ON "order_events" USING btree ("order_type", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_events_created" ON "order_events" USING btree ("created_at");
--> statement-breakpoint

-- ── exchange_orders: add status index if missing ─────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_exchange_orders_status" ON "exchange_orders" USING btree ("status");
