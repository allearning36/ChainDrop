---
name: Database Provider
description: Which database provider ChainDrop actually uses
---

## Current database: Neon

User confirmed (June 2026): the production database is **Neon** (neon.tech), NOT Supabase.
Previous memory entry claiming a Neon→Supabase migration was incorrect / stale.

## SSL fix
`lib/db/src/index.ts` detects `neon.tech` in DATABASE_URL and enables `ssl: { rejectUnauthorized: false }`.

## Railway DATABASE_URL
URL-encode special chars in password: `[` → `%5B`, `]` → `%5D`, `@` → `%40`
Always append `?sslmode=require`

## Running migrations
Neon dashboard → SQL Editor → paste SQL → Run.
