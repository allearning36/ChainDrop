// v10 — ensure chain_ads + earn_drop tables + ad_daily_chain_limit column on production
import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations, pool } from "@workspace/db";

const EXTRA_TABLES_SQL = `
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

  ALTER TABLE "chains" ADD COLUMN IF NOT EXISTS "ad_daily_chain_limit" integer NOT NULL DEFAULT 0;
`;

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — server continues");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection — server continues");
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Run DB migrations before accepting traffic
runMigrations()
  .then(async () => {
    logger.info("Database migrations applied");
    // Ensure newer tables exist (idempotent — safe every boot)
    try {
      await pool.query(EXTRA_TABLES_SQL);
      logger.info("Extra tables ensured (chain_ads, earn_drop_*)");
    } catch (err) {
      logger.warn({ err }, "Extra table setup warning — continuing");
    }
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Migration failed — aborting startup");
    process.exit(1);
  });
