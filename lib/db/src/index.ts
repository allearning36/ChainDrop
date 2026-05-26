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
});
export const db = drizzle(pool, { schema });

export async function runMigrations(migrationsFolder?: string): Promise<void> {
  const folder = migrationsFolder ?? path.join(__dirname, "migrations");
  try {
    await migrate(db, { migrationsFolder: folder });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // If tables already exist (e.g. schema was applied manually), mark the
    // baseline migration as done so Drizzle skips it on subsequent starts.
    if (msg.includes("already exists")) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
        INSERT INTO "__drizzle_migrations" (hash, created_at)
        SELECT '0000_light_luke_cage', ${Date.now()}
        WHERE NOT EXISTS (
          SELECT 1 FROM "__drizzle_migrations"
          WHERE hash = '0000_light_luke_cage'
        );
      `);
    } else {
      throw err;
    }
  }
}

export * from "./schema";
