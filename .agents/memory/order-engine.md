---
name: Order Engine architecture
description: Unified retry/refund/kill-switch system for Faucet Buy + Exchange orders
---

## Key decisions

**Per-order deposit wallets (Exchange):**
- Each exchange order generates an `ethers.Wallet.createRandom()` ephemeral wallet
- `depositAddress` + encrypted `depositPrivateKey` stored in `exchange_orders`
- User sends fromAmount to `order.depositAddress` (unique per order, no amount ambiguity)
- After payout: best-effort sweep of deposit wallet back to `pair.fromDepositAddress`
- Refund: send deposit wallet balance (minus 0.001 gas buffer) → `fromUserAddress` using `depositPrivateKey`
- Old orders (without depositAddress) fall back to `pair.fromDepositAddress` for backward compat

**`fromUserAddress` capture:**
- Exchange: captured from `receipt.from` at TX receipt polling in confirm step
- Buy: captured from `tx.from` via ethers.JsonRpcProvider at TX verification
- Stored in DB — required for refunds; if null, refund marked as failed (admin must handle manually)

**Retry/backoff (MAX_RETRIES=3, BACKOFF=[2,8,32] min):**
- On payout failure: increment `retryCount`, set `nextRetryAt`, set `lastError`
- After max retries: status → `failed` (exchange) or `failed` (buy)
- After 30min grace: `failed` → `refund_required` (buy recovery worker)
- Exchange: `failed` with retries exhausted → `refund_required` directly

**Kill switches** stored in settingsTable:
- `kill:buy` = "1" → block all new buy orders (503)
- `kill:exchange` = "1" → block all new exchange orders (503)
- `kill:chain:{chainId}` = "1" → block that specific testnet chain for buy

**Recovery worker** (unified, every 2min):
- Handles exchange pending/confirming/failed/refund_required AND buy pending/failed/refund_required
- Stops polling when no active orders; restarts when new order created (`ensureRecoveryWorkerRunning()`)
- Checks exchange first, then calls `runBuyRecovery()` exported from buy.ts

**Buy refund mechanism:**
- Uses chain's privateKey connected to payment network RPC (same key works on all EVM chains)
- Sends `mainnetAmountPaid - 0.0005` gas buffer back to `fromUserAddress` on payment network

**`checkRpcHealth` returns `{ status: "ok"|"error", latencyMs, url, error? }` — use `h.status === "ok"` not `h.ok`**
**`getWalletBalance` from chains/index signature: `(chainType, rpcUrls, address)` — chainType first**

## Status values
- Buy: `pending` | `completed` | `failed` | `refund_required` | `refunded`
- Exchange: `pending` | `confirming` | `completed` | `failed` | `refund_required` | `refunded` | `expired`
- refundStatus (both): `null` | `"pending"` | `"completed"` | `"failed"`

## New DB tables/columns
- `order_events` table: full audit log of all order state transitions
- `purchases` new cols: retryCount, nextRetryAt, lastError, refundTxHash, refundStatus, refundAt, fromUserAddress
- `exchange_orders` new cols: same + depositAddress, depositPrivateKey

## Admin endpoints added
- `GET/POST /admin/kill-switches` — read/write global + per-chain kill switches
- `GET /admin/orders/refunds` — list all orders in failed/refund states
- `POST /admin/orders/buy/:id/refund` — manual refund trigger for buy
- `POST /admin/orders/exchange/:id/refund` — manual refund trigger for exchange
- `GET /admin/order-events` — audit log query

## Admin UI added
- `KillSwitchPanel` — global buy/exchange toggles + per-chain toggles
- `RefundDashboard` — filtered view of failed/refund orders with manual refund buttons
- Both accessible from admin dashboard sidebar: "Kill Switches" (Power icon) + "Refunds" (RefreshCcw icon)

## Pre-flight endpoints
- `GET /faucet/buy/preflight/:chainId` — checks kill switch + chain enabled + RPC health + wallet balance
- `GET /exchange/preflight?pairId=` — checks kill switch + pair enabled + from/to RPC health + reserve balance
