-- ChainDrop Full Schema Migration for Supabase
-- Generated from Drizzle ORM schema files
-- Run this entire script in Supabase SQL Editor

-- =============================================
-- SETTINGS
-- =============================================
CREATE TABLE IF NOT EXISTS "settings" (
  "key" text PRIMARY KEY,
  "value" text,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- CHAINS
-- =============================================
CREATE TABLE IF NOT EXISTS "chains" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "symbol" text NOT NULL,
  "chain_id" integer,
  "logo_url" text,
  "rpc_url" text NOT NULL,
  "rpc_urls" text NOT NULL DEFAULT '[]',
  "private_key" text,
  "wallet_address" text,
  "claim_amount" numeric(18,8) NOT NULL DEFAULT '0.05',
  "cooldown_seconds" integer NOT NULL DEFAULT 86400,
  "is_testnet" boolean NOT NULL DEFAULT true,
  "is_enabled" boolean NOT NULL DEFAULT true,
  "is_pinned" boolean NOT NULL DEFAULT false,
  "available_status" text NOT NULL DEFAULT 'YES',
  "buy_enabled" boolean NOT NULL DEFAULT false,
  "buy_url" text,
  "buy_rate" numeric(18,4) NOT NULL DEFAULT '1000',
  "buy_rates" text NOT NULL DEFAULT '{}',
  "buy_limits" text NOT NULL DEFAULT '{}',
  "buy_min_amount" numeric(18,8) NOT NULL DEFAULT '0.0005',
  "buy_max_amount" numeric(18,8),
  "buy_currencies" text NOT NULL DEFAULT '["eth"]',
  "receive_address" text,
  "token_price" numeric(18,8),
  "explorer_url" text,
  "coingecko_id" text,
  "chain_type" text NOT NULL DEFAULT 'evm',
  "soon_message" text,
  "gas_price_gwei" numeric(18,4),
  "gas_limit" integer,
  "ad_claim_enabled" boolean NOT NULL DEFAULT false,
  "ad_claim_amount" numeric(18,8),
  "ad_duration_seconds" integer NOT NULL DEFAULT 30,
  "ad_cooldown_seconds" integer NOT NULL DEFAULT 0,
  "ad_network_code" text,
  "captcha_enabled" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- CLAIMS
-- =============================================
CREATE TABLE IF NOT EXISTS "claims" (
  "id" serial PRIMARY KEY,
  "chain_id" integer NOT NULL,
  "address" text NOT NULL,
  "tx_hash" text NOT NULL,
  "amount" numeric(18,8) NOT NULL,
  "claimed_at" timestamptz NOT NULL DEFAULT now(),
  "ip" text,
  "fingerprint" text,
  "user_agent" text,
  "country" text,
  "timezone" text,
  "vpn_detected" boolean DEFAULT false,
  "trust_score" real DEFAULT 50,
  "sig_verified" boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS "claims_address_chain_idx" ON "claims"("address", "chain_id");
CREATE INDEX IF NOT EXISTS "claims_ip_idx" ON "claims"("ip");
CREATE INDEX IF NOT EXISTS "claims_fingerprint_idx" ON "claims"("fingerprint");
CREATE INDEX IF NOT EXISTS "claims_claimed_at_idx" ON "claims"("claimed_at");

-- =============================================
-- PAGE VIEWS
-- =============================================
CREATE TABLE IF NOT EXISTS "page_views" (
  "id" serial PRIMARY KEY,
  "ip" text NOT NULL,
  "country_code" text,
  "country" text,
  "path" text NOT NULL DEFAULT '/',
  "user_agent" text,
  "device_type" text,
  "visited_at" timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- ANNOUNCEMENTS
-- =============================================
CREATE TABLE IF NOT EXISTS "announcements" (
  "id" serial PRIMARY KEY,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "image_url" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- BANNERS
-- =============================================
CREATE TABLE IF NOT EXISTS "banners" (
  "id" serial PRIMARY KEY,
  "image_url" text NOT NULL,
  "link_url" text,
  "alt_text" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- EXCHANGE PAIRS
-- =============================================
CREATE TABLE IF NOT EXISTS "exchange_pairs" (
  "id" serial PRIMARY KEY,
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
  "fee_percent" numeric(5,2) NOT NULL DEFAULT '1.00',
  "min_amount" numeric(18,8) NOT NULL DEFAULT '0.001',
  "max_amount" numeric(18,8) NOT NULL DEFAULT '1.0',
  "pair_private_key" text,
  "gas_limit" integer,
  "is_enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- EXCHANGE ORDERS
-- =============================================
CREATE TABLE IF NOT EXISTS "exchange_orders" (
  "id" text PRIMARY KEY,
  "pair_id" integer NOT NULL,
  "user_address" text NOT NULL,
  "from_amount" numeric(18,8) NOT NULL,
  "fee_amount" numeric(18,8) NOT NULL,
  "to_amount" numeric(18,8) NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "from_tx_hash" text,
  "to_tx_hash" text,
  "fail_reason" text,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);

-- =============================================
-- PURCHASES
-- =============================================
CREATE TABLE IF NOT EXISTS "purchases" (
  "id" serial PRIMARY KEY,
  "chain_id" integer NOT NULL,
  "user_address" text NOT NULL,
  "mainnet_tx_hash" text NOT NULL UNIQUE,
  "mainnet_amount_paid" numeric(18,8) NOT NULL,
  "testnet_amount_sent" numeric(18,8),
  "testnet_tx_hash" text,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- BLOCKED ADDRESSES
-- =============================================
CREATE TABLE IF NOT EXISTS "blocked_addresses" (
  "address" text PRIMARY KEY,
  "reason" text NOT NULL DEFAULT '',
  "blocked_at" timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- IP BLOCKS
-- =============================================
CREATE TABLE IF NOT EXISTS "ip_blocks" (
  "ip" text PRIMARY KEY,
  "reason" text NOT NULL DEFAULT '',
  "blocked_at" timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- ANTI-ABUSE: ABUSE LOGS
-- =============================================
CREATE TABLE IF NOT EXISTS "abuse_logs" (
  "id" serial PRIMARY KEY,
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
  "flags" jsonb DEFAULT '[]',
  "action" text NOT NULL DEFAULT 'allowed',
  "chain_id" integer,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "abuse_logs_ip_idx" ON "abuse_logs"("ip");
CREATE INDEX IF NOT EXISTS "abuse_logs_fingerprint_idx" ON "abuse_logs"("fingerprint");
CREATE INDEX IF NOT EXISTS "abuse_logs_address_idx" ON "abuse_logs"("address");
CREATE INDEX IF NOT EXISTS "abuse_logs_created_at_idx" ON "abuse_logs"("created_at");

-- =============================================
-- ANTI-ABUSE: AUTO BANS
-- =============================================
CREATE TABLE IF NOT EXISTS "auto_bans" (
  "id" serial PRIMARY KEY,
  "target_type" text NOT NULL,
  "target_value" text NOT NULL,
  "reason" text NOT NULL,
  "trust_score" real,
  "ban_count" integer DEFAULT 1,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "auto_bans_target_idx" ON "auto_bans"("target_type", "target_value");
CREATE INDEX IF NOT EXISTS "auto_bans_expires_idx" ON "auto_bans"("expires_at");

-- =============================================
-- IP REPUTATION CACHE
-- =============================================
CREATE TABLE IF NOT EXISTS "ip_rep_cache" (
  "ip" text PRIMARY KEY,
  "country" text,
  "country_code" text,
  "isp" text,
  "org" text,
  "vpn_detected" boolean DEFAULT false,
  "proxy_detected" boolean DEFAULT false,
  "tor_detected" boolean DEFAULT false,
  "datacenter_detected" boolean DEFAULT false,
  "reputation_score" real DEFAULT 100,
  "checked_at" timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- NONCES
-- =============================================
CREATE TABLE IF NOT EXISTS "nonces" (
  "id" serial PRIMARY KEY,
  "address" text NOT NULL,
  "nonce" text NOT NULL,
  "used_at" timestamptz,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "nonces_address_idx" ON "nonces"("address");

-- =============================================
-- LIVE ERROR LOGS
-- =============================================
CREATE TABLE IF NOT EXISTS "live_error_logs" (
  "id" serial PRIMARY KEY,
  "type" text NOT NULL,
  "ts" timestamptz NOT NULL DEFAULT now(),
  "chain_id" integer,
  "chain_name" text,
  "address" text,
  "ip" text,
  "error" text,
  "root_cause" text,
  "detail" text,
  "hint" text
);

CREATE INDEX IF NOT EXISTS "live_error_logs_ts_idx" ON "live_error_logs"("ts");
CREATE INDEX IF NOT EXISTS "live_error_logs_root_cause_idx" ON "live_error_logs"("root_cause");

-- =============================================
-- SUPPORT
-- =============================================
CREATE TABLE IF NOT EXISTS "support_conversations" (
  "id" serial PRIMARY KEY,
  "user_name" text NOT NULL,
  "user_email" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "user_token" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "support_messages" (
  "id" serial PRIMARY KEY,
  "conversation_id" integer NOT NULL REFERENCES "support_conversations"("id") ON DELETE CASCADE,
  "content" text NOT NULL DEFAULT '',
  "image_url" text,
  "is_admin" boolean NOT NULL DEFAULT false,
  "admin_seen" boolean NOT NULL DEFAULT false,
  "user_seen" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- AD TOKENS
-- =============================================
CREATE TABLE IF NOT EXISTS "ad_tokens" (
  "id" serial PRIMARY KEY,
  "chain_id" integer NOT NULL,
  "address" text NOT NULL,
  "token" text NOT NULL UNIQUE,
  "issued_at" timestamptz NOT NULL DEFAULT now(),
  "valid_after" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz
);

-- =============================================
-- PAGES (custom content pages)
-- =============================================
CREATE TABLE IF NOT EXISTS "pages" (
  "slug" text PRIMARY KEY,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- MASTER CHAINS
-- =============================================
CREATE TABLE IF NOT EXISTS "master_chains" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "symbol" text NOT NULL,
  "chain_id" integer,
  "chain_type" text NOT NULL DEFAULT 'evm',
  "logo_url" text,
  "rpc_urls" text NOT NULL DEFAULT '[]',
  "explorer_urls" text NOT NULL DEFAULT '[]',
  "is_testnet" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- PAYMENT NETWORKS
-- =============================================
CREATE TABLE IF NOT EXISTS "payment_networks" (
  "id" serial PRIMARY KEY,
  "network_id" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "symbol" text NOT NULL DEFAULT 'ETH',
  "chain_id" integer NOT NULL,
  "rpc_url" text NOT NULL,
  "rpc_urls" text NOT NULL DEFAULT '[]',
  "block_explorer_url" text,
  "is_token" boolean NOT NULL DEFAULT false,
  "contract_address" text,
  "token_decimals" integer NOT NULL DEFAULT 18,
  "logo_url" text,
  "is_enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- REFERRALS
-- =============================================
CREATE TABLE IF NOT EXISTS "referrals" (
  "id" serial PRIMARY KEY,
  "referrer_address" text NOT NULL,
  "referee_address" text NOT NULL UNIQUE,
  "level" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "referral_commissions" (
  "id" serial PRIMARY KEY,
  "referrer_address" text NOT NULL,
  "referee_address" text NOT NULL,
  "level" integer NOT NULL,
  "source_type" text NOT NULL,
  "source_id" integer,
  "chain_id" integer NOT NULL,
  "amount_eth" numeric(18,10) NOT NULL,
  "commission_pct" numeric(5,2) NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "claim_tx_hash" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "paid_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "referral_claim_requests" (
  "id" serial PRIMARY KEY,
  "wallet_address" text NOT NULL,
  "amount_eth" numeric(18,10) NOT NULL,
  "claim_chain_id" integer NOT NULL,
  "signature" text NOT NULL,
  "nonce" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "admin_note" text,
  "tx_hash" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "processed_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "referral_balance_adjustments" (
  "id" serial PRIMARY KEY,
  "wallet_address" text NOT NULL,
  "type" text NOT NULL,
  "amount_eth" numeric(18,10) NOT NULL,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Done!
SELECT 'ChainDrop schema created successfully!' as result;
