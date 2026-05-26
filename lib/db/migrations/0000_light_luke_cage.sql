CREATE TABLE "claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"address" text NOT NULL,
	"tx_hash" text NOT NULL,
	"amount" numeric(18, 8) NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"fingerprint" text,
	"user_agent" text,
	"country" text,
	"timezone" text,
	"vpn_detected" boolean DEFAULT false,
	"trust_score" real DEFAULT 50,
	"sig_verified" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "chains" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"chain_id" integer,
	"logo_url" text,
	"rpc_url" text NOT NULL,
	"rpc_urls" text DEFAULT '[]' NOT NULL,
	"private_key" text,
	"wallet_address" text,
	"claim_amount" numeric(18, 8) DEFAULT '0.05' NOT NULL,
	"cooldown_seconds" integer DEFAULT 86400 NOT NULL,
	"is_testnet" boolean DEFAULT true NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"available_status" text DEFAULT 'YES' NOT NULL,
	"buy_enabled" boolean DEFAULT false NOT NULL,
	"buy_url" text,
	"buy_rate" numeric(18, 4) DEFAULT '1000' NOT NULL,
	"buy_rates" text DEFAULT '{}' NOT NULL,
	"buy_limits" text DEFAULT '{}' NOT NULL,
	"buy_min_amount" numeric(18, 8) DEFAULT '0.0005' NOT NULL,
	"buy_max_amount" numeric(18, 8),
	"buy_currencies" text DEFAULT '["eth"]' NOT NULL,
	"receive_address" text,
	"token_price" numeric(18, 8),
	"explorer_url" text,
	"coingecko_id" text,
	"chain_type" text DEFAULT 'evm' NOT NULL,
	"soon_message" text,
	"gas_price_gwei" numeric(18, 4),
	"gas_limit" integer,
	"ad_claim_enabled" boolean DEFAULT false NOT NULL,
	"ad_claim_amount" numeric(18, 8),
	"ad_duration_seconds" integer DEFAULT 30 NOT NULL,
	"ad_cooldown_seconds" integer DEFAULT 0 NOT NULL,
	"ad_network_code" text,
	"captcha_enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"address" text NOT NULL,
	"token" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_after" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "ad_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "banners" (
	"id" serial PRIMARY KEY NOT NULL,
	"image_url" text NOT NULL,
	"link_url" text,
	"alt_text" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"user_address" text NOT NULL,
	"mainnet_tx_hash" text NOT NULL,
	"mainnet_amount_paid" numeric(18, 8) NOT NULL,
	"testnet_amount_sent" numeric(18, 8),
	"testnet_tx_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_mainnet_tx_hash_unique" UNIQUE("mainnet_tx_hash")
);
--> statement-breakpoint
CREATE TABLE "support_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_name" text NOT NULL,
	"user_email" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"user_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
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
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocked_addresses" (
	"address" text PRIMARY KEY NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"blocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ip_blocks" (
	"ip" text PRIMARY KEY NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"blocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_views" (
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
CREATE TABLE "exchange_pairs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"from_chain_name" text NOT NULL,
	"from_symbol" text NOT NULL,
	"from_chain_id" integer NOT NULL,
	"from_rpc_url" text NOT NULL,
	"from_rpc_urls" text,
	"from_explorer_url" text,
	"from_deposit_address" text NOT NULL,
	"from_logo_url" text,
	"to_chain_name" text NOT NULL,
	"to_symbol" text NOT NULL,
	"to_chain_id" integer NOT NULL,
	"to_rpc_url" text NOT NULL,
	"to_rpc_urls" text,
	"to_explorer_url" text,
	"to_logo_url" text,
	"fee_percent" numeric(5, 2) DEFAULT '1.00' NOT NULL,
	"min_amount" numeric(18, 8) DEFAULT '0.001' NOT NULL,
	"max_amount" numeric(18, 8) DEFAULT '1.0' NOT NULL,
	"pair_private_key" text,
	"gas_limit" integer,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"pair_id" integer NOT NULL,
	"user_address" text NOT NULL,
	"from_amount" numeric(18, 8) NOT NULL,
	"fee_amount" numeric(18, 8) NOT NULL,
	"to_amount" numeric(18, 8) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"from_tx_hash" text,
	"to_tx_hash" text,
	"fail_reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_networks" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" text NOT NULL,
	"name" text NOT NULL,
	"symbol" text DEFAULT 'ETH' NOT NULL,
	"chain_id" integer NOT NULL,
	"rpc_url" text NOT NULL,
	"rpc_urls" text DEFAULT '[]' NOT NULL,
	"block_explorer_url" text,
	"is_token" boolean DEFAULT false NOT NULL,
	"contract_address" text,
	"token_decimals" integer DEFAULT 18 NOT NULL,
	"logo_url" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_networks_network_id_unique" UNIQUE("network_id")
);
--> statement-breakpoint
CREATE TABLE "referral_balance_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"type" text NOT NULL,
	"amount_eth" numeric(18, 10) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_claim_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"amount_eth" numeric(18, 10) NOT NULL,
	"claim_chain_id" integer NOT NULL,
	"signature" text NOT NULL,
	"nonce" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"tx_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "referral_commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"referrer_address" text NOT NULL,
	"referee_address" text NOT NULL,
	"level" integer NOT NULL,
	"source_type" text NOT NULL,
	"source_id" integer,
	"chain_id" integer NOT NULL,
	"amount_eth" numeric(18, 10) NOT NULL,
	"commission_pct" numeric(5, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"claim_tx_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" serial PRIMARY KEY NOT NULL,
	"referrer_address" text NOT NULL,
	"referee_address" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referrals_referee_address_unique" UNIQUE("referee_address")
);
--> statement-breakpoint
CREATE TABLE "abuse_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"ip" text NOT NULL,
	"fingerprint" text,
	"user_agent" text,
	"timezone" text,
	"country" text,
	"isp" text,
	"vpn_detected" boolean DEFAULT false,
	"proxy_detected" boolean DEFAULT false,
	"tor_detected" boolean DEFAULT false,
	"datacenter_detected" boolean DEFAULT false,
	"trust_score" real DEFAULT 50,
	"flags" jsonb DEFAULT '[]'::jsonb,
	"action" text DEFAULT 'allowed' NOT NULL,
	"chain_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_bans" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_type" text NOT NULL,
	"target_value" text NOT NULL,
	"reason" text NOT NULL,
	"trust_score" real,
	"ban_count" integer DEFAULT 1,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ip_rep_cache" (
	"ip" text PRIMARY KEY NOT NULL,
	"country" text,
	"country_code" text,
	"isp" text,
	"org" text,
	"vpn_detected" boolean DEFAULT false,
	"proxy_detected" boolean DEFAULT false,
	"tor_detected" boolean DEFAULT false,
	"datacenter_detected" boolean DEFAULT false,
	"reputation_score" real DEFAULT 100,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nonces" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"nonce" text NOT NULL,
	"used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_chains" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"chain_id" integer,
	"chain_type" text DEFAULT 'evm' NOT NULL,
	"logo_url" text,
	"rpc_urls" text DEFAULT '[]' NOT NULL,
	"explorer_urls" text DEFAULT '[]' NOT NULL,
	"is_testnet" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_chain_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_chain_id" integer NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"contract_address" text NOT NULL,
	"decimals" integer DEFAULT 18 NOT NULL,
	"logo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_error_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"chain_id" integer,
	"chain_name" text,
	"address" text,
	"ip" text,
	"error" text,
	"root_cause" text,
	"detail" text,
	"hint" text
);
--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_conversation_id_support_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."support_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claims_address_chain_idx" ON "claims" USING btree ("address","chain_id");--> statement-breakpoint
CREATE INDEX "claims_ip_idx" ON "claims" USING btree ("ip");--> statement-breakpoint
CREATE INDEX "claims_fingerprint_idx" ON "claims" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "claims_claimed_at_idx" ON "claims" USING btree ("claimed_at");--> statement-breakpoint
CREATE INDEX "abuse_logs_ip_idx" ON "abuse_logs" USING btree ("ip");--> statement-breakpoint
CREATE INDEX "abuse_logs_fingerprint_idx" ON "abuse_logs" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "abuse_logs_address_idx" ON "abuse_logs" USING btree ("address");--> statement-breakpoint
CREATE INDEX "abuse_logs_created_at_idx" ON "abuse_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "auto_bans_target_idx" ON "auto_bans" USING btree ("target_type","target_value");--> statement-breakpoint
CREATE INDEX "auto_bans_expires_idx" ON "auto_bans" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "nonces_address_idx" ON "nonces" USING btree ("address");--> statement-breakpoint
CREATE INDEX "live_error_logs_ts_idx" ON "live_error_logs" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "live_error_logs_root_cause_idx" ON "live_error_logs" USING btree ("root_cause");