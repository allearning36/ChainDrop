---
name: Railway IPv6 crash
description: Railway does not support IPv6 — Supabase direct connection resolves to IPv6 causing ENOTUNREACH crashes
---

## Rule
Always add `--dns-result-order=ipv4first` to the Node.js start command when deploying on Railway with Supabase (or any cloud DB that may resolve to IPv6).

**Why:** Railway's network infrastructure does not support IPv6. Supabase's direct connection host (`db.<ref>.supabase.co`) resolves to an IPv6 address in some regions, causing `ENOTUNREACH` at connection time and immediate server crash (`Exit status 1`).

**How to apply:**
- In `artifacts/api-server/package.json` start script: `node --dns-result-order=ipv4first --enable-source-maps ./dist/index.mjs`
- This forces Node.js DNS resolver to prefer IPv4 over IPv6 globally.
- Alternatively, use Supabase's session pooler URL (`aws-0-<region>.pooler.supabase.com:5432`) which resolves to IPv4.

## Supabase connection notes
- Direct URL (`db.<ref>.supabase.co:5432`) may resolve to IPv6 — avoid on Railway without IPv4 flag
- Session pooler (`postgres.<ref>@aws-0-<region>.pooler.supabase.com:5432`) resolves to IPv4 ✅
- Transaction pooler (port 6543) does NOT support prepared statements — incompatible with Drizzle migrations
- SSL: always use `rejectUnauthorized: false` with Supabase
- Password special chars (`@`) must be URL-encoded (`%40`) in connection strings
