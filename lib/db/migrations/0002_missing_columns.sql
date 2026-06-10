-- Migration 0002: add columns that were added to schema after initial migration
-- All statements use IF NOT EXISTS / DO blocks to be safe against any DB state.

-- chains: add missing ad_type and address_regex columns
ALTER TABLE "chains" ADD COLUMN IF NOT EXISTS "ad_type" text NOT NULL DEFAULT 'url';
--> statement-breakpoint
ALTER TABLE "chains" ADD COLUMN IF NOT EXISTS "address_regex" text;
--> statement-breakpoint

-- master_chains: add missing address_regex column
ALTER TABLE "master_chains" ADD COLUMN IF NOT EXISTS "address_regex" text;
--> statement-breakpoint

-- promo_codes table (was not in original migration)
CREATE TABLE IF NOT EXISTS "promo_codes" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "chain_id" integer NOT NULL,
  "claim_amount" numeric(18, 8) NOT NULL,
  "max_claims" integer DEFAULT 100 NOT NULL,
  "used_count" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "note" text,
  "code_link" text,
  "success_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone,
  CONSTRAINT "promo_codes_code_unique" UNIQUE ("code")
);
--> statement-breakpoint

-- promo_claims table (was not in original migration)
CREATE TABLE IF NOT EXISTS "promo_claims" (
  "id" serial PRIMARY KEY NOT NULL,
  "promo_id" integer NOT NULL,
  "address" text NOT NULL,
  "ip" text,
  "tx_hash" text NOT NULL,
  "claimed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "promo_codes_chain_idx" ON "promo_codes" USING btree ("chain_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promo_codes_code_idx" ON "promo_codes" USING btree ("code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promo_claims_promo_idx" ON "promo_claims" USING btree ("promo_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promo_claims_address_idx" ON "promo_claims" USING btree ("address");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promo_claims_ip_idx" ON "promo_claims" USING btree ("ip");
