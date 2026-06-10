import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "path";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Enable SSL for Supabase, Neon, or any URL with sslmode=require
const sslEnabled =
  process.env.DATABASE_URL.includes("sslmode=require") ||
  process.env.DATABASE_URL.includes(".supabase.co") ||
  process.env.DATABASE_URL.includes("supabase.com") ||
  process.env.DATABASE_URL.includes("neon.tech");

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
  max: 5,
});

export const db = drizzle(pool, { schema });

const DRIZZLE_MIGRATIONS_TABLE = "__drizzle_migrations";
const BASELINE_HASH = "0000_light_luke_cage";

const CHAIN_ADS_SQL = `
  CREATE TABLE IF NOT EXISTS "chain_ads" (
    "id" serial PRIMARY KEY NOT NULL,
    "chain_id" integer NOT NULL REFERENCES "chains"("id") ON DELETE CASCADE,
    "label" text NOT NULL DEFAULT '',
    "ad_url" text NOT NULL,
    "ad_type" text NOT NULL DEFAULT 'vast',
    "priority" integer NOT NULL DEFAULT 0,
    "is_enabled" boolean NOT NULL DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE INDEX IF NOT EXISTS "chain_ads_chain_idx" ON "chain_ads" ("chain_id");
`;

const EARN_DROP_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS "earn_drop_campaigns" (
    "id" serial PRIMARY KEY NOT NULL,
    "title" text NOT NULL,
    "logo_url" text NOT NULL DEFAULT '',
    "reward_amount" numeric(18, 8) NOT NULL,
    "reward_token" text NOT NULL,
    "chain_id" integer NOT NULL,
    "end_date" timestamp with time zone NOT NULL,
    "rules" text NOT NULL DEFAULT '',
    "twitter_url" text NOT NULL DEFAULT '',
    "telegram_url" text NOT NULL DEFAULT '',
    "discord_url" text NOT NULL DEFAULT '',
    "website_url" text NOT NULL DEFAULT '',
    "promo_code_enabled" boolean NOT NULL DEFAULT false,
    "promo_schedule_enabled" boolean NOT NULL DEFAULT false,
    "promo_schedule_at" timestamp with time zone,
    "is_active" boolean NOT NULL DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE INDEX IF NOT EXISTS "earn_drop_campaigns_active_idx" ON "earn_drop_campaigns" ("is_active");

  CREATE TABLE IF NOT EXISTS "earn_drop_tasks" (
    "id" serial PRIMARY KEY NOT NULL,
    "campaign_id" integer NOT NULL,
    "step_number" integer NOT NULL,
    "title" text NOT NULL,
    "description" text NOT NULL DEFAULT '',
    "logo_url" text NOT NULL DEFAULT '',
    "action_type" text NOT NULL DEFAULT 'link',
    "action_url" text NOT NULL DEFAULT '',
    "action_label" text NOT NULL DEFAULT 'Go',
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE INDEX IF NOT EXISTS "earn_drop_tasks_campaign_idx" ON "earn_drop_tasks" ("campaign_id");

  CREATE TABLE IF NOT EXISTS "earn_drop_promo_codes" (
    "id" serial PRIMARY KEY NOT NULL,
    "campaign_id" integer NOT NULL,
    "code" text NOT NULL,
    "max_uses" integer NOT NULL DEFAULT 0,
    "used_count" integer NOT NULL DEFAULT 0,
    "is_active" boolean NOT NULL DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE INDEX IF NOT EXISTS "earn_drop_promo_campaign_idx" ON "earn_drop_promo_codes" ("campaign_id");
  CREATE INDEX IF NOT EXISTS "earn_drop_promo_code_idx" ON "earn_drop_promo_codes" ("code");

  CREATE TABLE IF NOT EXISTS "earn_drop_participants" (
    "id" serial PRIMARY KEY NOT NULL,
    "campaign_id" integer NOT NULL,
    "address" text NOT NULL,
    "completed_steps" jsonb NOT NULL DEFAULT '[]',
    "promo_code" text,
    "status" text NOT NULL DEFAULT 'pending',
    "tx_hash" text,
    "claimed_at" timestamp with time zone,
    "claimed_from_ip" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE INDEX IF NOT EXISTS "earn_drop_participants_campaign_idx" ON "earn_drop_participants" ("campaign_id");
  CREATE INDEX IF NOT EXISTS "earn_drop_participants_address_idx" ON "earn_drop_participants" ("address");

  CREATE TABLE IF NOT EXISTS "earn_drop_joins" (
    "id" serial PRIMARY KEY NOT NULL,
    "campaign_id" integer NOT NULL,
    "session_id" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE INDEX IF NOT EXISTS "earn_drop_joins_campaign_idx" ON "earn_drop_joins" ("campaign_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "earn_drop_joins_unique_idx" ON "earn_drop_joins" ("campaign_id", "session_id");
`;

const PROMO_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS "promo_codes" (
    "id" serial PRIMARY KEY NOT NULL,
    "code" text NOT NULL UNIQUE,
    "chain_id" integer NOT NULL,
    "claim_amount" numeric(18, 8) NOT NULL,
    "max_claims" integer DEFAULT 100 NOT NULL,
    "used_count" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "note" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "expires_at" timestamp with time zone
  );
  CREATE INDEX IF NOT EXISTS "promo_codes_chain_idx" ON "promo_codes" ("chain_id");
  CREATE INDEX IF NOT EXISTS "promo_codes_code_idx" ON "promo_codes" ("code");

  CREATE TABLE IF NOT EXISTS "promo_claims" (
    "id" serial PRIMARY KEY NOT NULL,
    "promo_id" integer NOT NULL,
    "address" text NOT NULL,
    "ip" text,
    "tx_hash" text NOT NULL,
    "claimed_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE INDEX IF NOT EXISTS "promo_claims_promo_idx" ON "promo_claims" ("promo_id");
  CREATE INDEX IF NOT EXISTS "promo_claims_address_idx" ON "promo_claims" ("address");
  CREATE INDEX IF NOT EXISTS "promo_claims_ip_idx" ON "promo_claims" ("ip");
`;

const REFERRAL_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS "referrals" (
    "id" serial PRIMARY KEY NOT NULL,
    "referrer_address" text NOT NULL,
    "referee_address" text NOT NULL,
    "level" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "referrals_referee_address_unique" UNIQUE("referee_address")
  );
  CREATE TABLE IF NOT EXISTS "referral_commissions" (
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
  CREATE TABLE IF NOT EXISTS "referral_claim_requests" (
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
  CREATE TABLE IF NOT EXISTS "referral_balance_adjustments" (
    "id" serial PRIMARY KEY NOT NULL,
    "wallet_address" text NOT NULL,
    "type" text NOT NULL,
    "amount_eth" numeric(18, 10) NOT NULL,
    "note" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
`;

export async function runMigrations(migrationsFolder?: string): Promise<void> {
  const folder = migrationsFolder ?? path.join(__dirname, "migrations");

  // Step 1: verify connection (hard fail — no DB = server is useless)
  await pool.query("SELECT 1");

  // Step 2: run Drizzle migrations; if they fail (tables already exist from
  // manual SQL setup), mark the baseline as applied and continue.
  try {
    await migrate(db, { migrationsFolder: folder });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[db] Migration skipped (${msg.slice(0, 120)}) — marking baseline as applied`,
    );
    // Best-effort: insert migration record so Drizzle won't retry on next boot
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${DRIZZLE_MIGRATIONS_TABLE}" (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
        INSERT INTO "${DRIZZLE_MIGRATIONS_TABLE}" (hash, created_at)
        SELECT '${BASELINE_HASH}', ${Date.now()}
        WHERE NOT EXISTS (
          SELECT 1 FROM "${DRIZZLE_MIGRATIONS_TABLE}"
          WHERE hash = '${BASELINE_HASH}'
        );
      `);
    } catch (markErr) {
      console.warn(
        `[db] Could not record migration baseline: ${markErr instanceof Error ? markErr.message : String(markErr)}`,
      );
    }
  }

  // Step 3: ensure referral tables exist (idempotent — safe to run every boot)
  try {
    await pool.query(REFERRAL_TABLES_SQL);
  } catch (tblErr) {
    console.warn(
      `[db] Referral table setup warning: ${tblErr instanceof Error ? tblErr.message : String(tblErr)}`,
    );
  }

  // Step 4: ensure promo tables exist (idempotent — safe to run every boot)
  try {
    await pool.query(PROMO_TABLES_SQL);
  } catch (tblErr) {
    console.warn(
      `[db] Promo table setup warning: ${tblErr instanceof Error ? tblErr.message : String(tblErr)}`,
    );
  }

  // Step 5: ensure chain_ads table exists (idempotent — safe to run every boot)
  try {
    await pool.query(CHAIN_ADS_SQL);
  } catch (tblErr) {
    console.warn(
      `[db] Chain ads table setup warning: ${tblErr instanceof Error ? tblErr.message : String(tblErr)}`,
    );
  }

  // Step 6: ensure earn_drop tables exist (idempotent — safe to run every boot)
  try {
    await pool.query(EARN_DROP_TABLES_SQL);
  } catch (tblErr) {
    console.warn(
      `[db] Earn drop table setup warning: ${tblErr instanceof Error ? tblErr.message : String(tblErr)}`,
    );
  }
}

export * from "./schema";
