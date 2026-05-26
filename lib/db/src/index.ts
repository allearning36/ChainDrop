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
  process.env.DATABASE_URL.includes("neon.tech");

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 5,
});

export const db = drizzle(pool, { schema });

// Table name Drizzle uses internally for tracking applied migrations
const DRIZZLE_MIGRATIONS_TABLE = "__drizzle_migrations";
// The hash for our single baseline migration file
const BASELINE_HASH = "0000_light_luke_cage";

async function ensureMigrationTracked(): Promise<void> {
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
}

export async function runMigrations(migrationsFolder?: string): Promise<void> {
  const folder = migrationsFolder ?? path.join(__dirname, "migrations");

  // First verify the DB connection is healthy before attempting migrations
  try {
    await pool.query("SELECT 1");
  } catch (connErr) {
    throw new Error(
      `Database connection failed: ${connErr instanceof Error ? connErr.message : String(connErr)}`,
    );
  }

  try {
    await migrate(db, { migrationsFolder: folder });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    // Drizzle failed to apply migrations — this is expected when tables were
    // created manually (e.g. via Supabase SQL editor). Mark the baseline as
    // done so subsequent restarts skip it cleanly.
    console.warn(
      `[db] Migration warning (${msg.slice(0, 120)}) — marking baseline as applied and continuing`,
    );

    try {
      await ensureMigrationTracked();
    } catch (markErr) {
      // If even this fails (e.g. permission issue), log and continue anyway.
      // A running server with schema already applied is better than crashing.
      console.error(
        `[db] Could not record migration baseline: ${markErr instanceof Error ? markErr.message : String(markErr)} — continuing anyway`,
      );
    }
  }

  // Always ensure referral tables exist — they may have been added after the
  // initial manual schema was applied in Supabase.
  await pool.query(`
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
  `);
}

export * from "./schema";
