---
name: ChainDrop Vercel Deployment
description: chaindrop.app frontend is on Vercel, not Railway. Static files must be updated in faucet-hub/public/.
---

# ChainDrop Deployment Architecture

**Rule:** `chaindrop.app` is served by **Vercel** (frontend), not Railway.

- Vercel builds: `pnpm --filter @workspace/faucet-hub run build`
- Vercel output: `artifacts/faucet-hub/dist/public`
- Railway serves only the API: `workspaceapi-server-production-98d2.up.railway.app`
- Vercel rewrites `/api/*` → Railway

**Why:** vercel.json is at repo root, pointing to faucet-hub build. Railway has nixpacks.toml for api-server only.

**How to apply:**
- Static files (ads.txt, robots.txt, etc.) → `artifacts/faucet-hub/public/`
- HTML meta tags → `artifacts/faucet-hub/index.html`
- API changes → `artifacts/api-server/src/`
- Push to GitHub → Vercel auto-deploys frontend, Railway auto-deploys API
- Never try to serve static frontend files via Railway — they won't reach production domain.

## AdSense Verification (for any new account)
1. Update `artifacts/faucet-hub/public/ads.txt` with new publisher ID
2. Add to `artifacts/faucet-hub/index.html` head:
   - `<meta name="google-adsense-account" content="ca-pub-XXXXXXXXXX">`
   - AdSense script tag
3. Push to GitHub → Vercel redeploys in 2-3 min
4. Verify in Google AdSense dashboard
