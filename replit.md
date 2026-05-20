# Faucet Hub

A Sepolia ETH testnet faucet — users enter their EVM wallet address and claim free Sepolia ETH for smart contract development and testing.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/faucet-hub run dev` — run the frontend (port assigned by workflow)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required secrets: `FAUCET_PRIVATE_KEY`, `SEPOLIA_RPC_URL`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Blockchain: ethers.js v6 for Sepolia transactions
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/claims.ts` — claims table schema
- `artifacts/api-server/src/routes/faucet.ts` — faucet API routes
- `artifacts/api-server/src/lib/faucet.ts` — ethers.js transaction logic
- `artifacts/faucet-hub/src/pages/home.tsx` — main faucet UI

## Architecture decisions

- Rate limiting is DB-backed (24-hour cooldown per address stored in `claims` table)
- Faucet sends ETH immediately on claim — no queue; tx hash returned directly
- Faucet wallet balance is fetched live from the RPC on each `/faucet/stats` call
- All addresses stored lowercase for consistent deduplication
- Claim amount (0.05 ETH) and cooldown (24h) are constants in `artifacts/api-server/src/lib/faucet.ts`

## Product

- Users paste an EVM address and click "Request Funds" to receive 0.05 Sepolia ETH
- 24-hour cooldown enforced per address
- Live stats: total claims, total ETH distributed, faucet wallet balance
- Recent claims feed showing last 20 distributions
- Tx hash links to Sepolia Etherscan on success

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## CAPTCHA

reCAPTCHA v2 সক্রিয় আছে (ClaimModal + backend faucet route)।

### Env vars প্রয়োজন
- `VITE_RECAPTCHA_SITE_KEY` — frontend public site key (Google reCAPTCHA console থেকে); fallback হিসেবে Google-এর test key ব্যবহার হচ্ছে
- `RECAPTCHA_SECRET_KEY` — backend secret key (Replit Secrets-এ) — যদি না থাকে, backend CAPTCHA skip করে (dev mode)

### Domain whitelist
Google reCAPTCHA admin-এ Replit domain (`*.replit.dev`, `*.replit.app`) যোগ করতে হবে।

## Gotchas

- `FAUCET_PRIVATE_KEY` wallet must have Sepolia ETH balance or claims will fail
- Run `pnpm run typecheck:libs` after any DB schema changes before running `typecheck` on artifacts
- After any OpenAPI spec change, always re-run codegen before touching routes or frontend
