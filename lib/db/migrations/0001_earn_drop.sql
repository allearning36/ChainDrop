-- Migration 0001: create earn_drop tables + ensure support/page_views exist
-- Uses IF NOT EXISTS throughout so this is safe to replay against any state.

CREATE TABLE IF NOT EXISTS "support_conversations" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_name" text NOT NULL,
  "user_email" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "user_token" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "support_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "conversation_id" integer NOT NULL,
  "content" text DEFAULT '' NOT NULL,
  "image_url" text,
  "is_admin" boolean DEFAULT false NOT NULL,
  "admin_seen" boolean DEFAULT false NOT NULL,
  "user_seen" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "support_messages"
    ADD CONSTRAINT "support_messages_conversation_id_fk"
    FOREIGN KEY ("conversation_id") REFERENCES "support_conversations"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "page_views" (
  "id" serial PRIMARY KEY NOT NULL,
  "ip" text NOT NULL,
  "country_code" text,
  "country" text,
  "path" text DEFAULT '/' NOT NULL,
  "user_agent" text,
  "device_type" text,
  "visited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "earn_drop_campaigns" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "logo_url" text DEFAULT '' NOT NULL,
  "reward_amount" numeric(18, 8) NOT NULL,
  "reward_token" text NOT NULL,
  "chain_id" integer NOT NULL,
  "end_date" timestamp with time zone NOT NULL,
  "rules" text DEFAULT '' NOT NULL,
  "twitter_url" text DEFAULT '' NOT NULL,
  "telegram_url" text DEFAULT '' NOT NULL,
  "discord_url" text DEFAULT '' NOT NULL,
  "website_url" text DEFAULT '' NOT NULL,
  "promo_code_enabled" boolean DEFAULT false NOT NULL,
  "promo_schedule_enabled" boolean DEFAULT false NOT NULL,
  "promo_schedule_at" timestamp with time zone,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "earn_drop_tasks" (
  "id" serial PRIMARY KEY NOT NULL,
  "campaign_id" integer NOT NULL,
  "step_number" integer NOT NULL,
  "title" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "logo_url" text DEFAULT '' NOT NULL,
  "action_type" text DEFAULT 'link' NOT NULL,
  "action_url" text DEFAULT '' NOT NULL,
  "action_label" text DEFAULT 'Go' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "earn_drop_promo_codes" (
  "id" serial PRIMARY KEY NOT NULL,
  "campaign_id" integer NOT NULL,
  "code" text NOT NULL,
  "max_uses" integer DEFAULT 0 NOT NULL,
  "used_count" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "earn_drop_participants" (
  "id" serial PRIMARY KEY NOT NULL,
  "campaign_id" integer NOT NULL,
  "address" text NOT NULL,
  "completed_steps" jsonb DEFAULT '[]' NOT NULL,
  "promo_code" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "tx_hash" text,
  "claimed_at" timestamp with time zone,
  "claimed_from_ip" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "earn_drop_joins" (
  "id" serial PRIMARY KEY NOT NULL,
  "campaign_id" integer NOT NULL,
  "session_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "earn_drop_campaigns_active_idx" ON "earn_drop_campaigns" USING btree ("is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "earn_drop_tasks_campaign_idx" ON "earn_drop_tasks" USING btree ("campaign_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "earn_drop_promo_campaign_idx" ON "earn_drop_promo_codes" USING btree ("campaign_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "earn_drop_promo_code_idx" ON "earn_drop_promo_codes" USING btree ("code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "earn_drop_participants_campaign_idx" ON "earn_drop_participants" USING btree ("campaign_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "earn_drop_participants_address_idx" ON "earn_drop_participants" USING btree ("address");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "earn_drop_joins_campaign_idx" ON "earn_drop_joins" USING btree ("campaign_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "earn_drop_joins_unique_idx" ON "earn_drop_joins" USING btree ("campaign_id", "session_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_support_conversations_status" ON "support_conversations" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_support_conversations_updated_at" ON "support_conversations" USING btree ("updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_support_messages_conversation_id" ON "support_messages" USING btree ("conversation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_support_messages_admin_seen" ON "support_messages" USING btree ("admin_seen");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_tokens_address" ON "ad_tokens" USING btree ("address");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_tokens_chain_id" ON "ad_tokens" USING btree ("chain_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_tokens_expires_at" ON "ad_tokens" USING btree ("issued_at", "expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exchange_orders_status" ON "exchange_orders" USING btree ("status");
