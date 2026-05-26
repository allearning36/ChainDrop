---
name: Supabase Migration
description: Neon → Supabase migration details and gotchas
---

## What happened
Neon free tier hit 100% monthly data transfer (5 GB). Migrated DB to Supabase free tier (no transfer limit, 500 MB storage).

## Supabase project
- Project ref: `mabgsowgrlqnxapxcedk`
- Region: Asia-Pacific
- Direct connection host: `db.mabgsowgrlqnxapxcedk.supabase.co:5432`

## SSL fix (critical)
`lib/db/src/index.ts` — `new Pool({ connectionString })` does NOT enable SSL by default.
Supabase requires SSL. Fix: detect `sslmode=require` or `.supabase.co` in DATABASE_URL and pass `ssl: { rejectUnauthorized: false }`.

**Why:** Supabase uses SSL-only connections; without explicit SSL config the pool connection is refused or crashes.

## Migration resilience fix
`runMigrations()` was calling `migrate()` which runs `CREATE TABLE` (no IF NOT EXISTS) against already-existing tables → crashes.
Fix: catch `"already exists"` error → insert migration record into `__drizzle_migrations` so Drizzle skips it next restart.

## Manual schema deployment
When pg_dump from Neon is blocked (quota) and psql to Supabase fails (IPv6 from Replit), workaround:
1. Generate SQL from Drizzle schema files manually (IF NOT EXISTS version)
2. Host at a public URL (e.g. put in `artifacts/faucet-hub/public/`, wait for Vercel deploy)
3. User pastes into Supabase SQL Editor → Run without RLS

## Railway DATABASE_URL
URL-encode special chars in password: `[` → `%5B`, `]` → `%5D`, `@` → `%40`
Always append `?sslmode=require`
