---
name: Polling intervals
description: Frontend polling was causing excessive DB network transfer on Neon/Supabase free tiers
---

## Problem
Aggressive refetchInterval values were hammering the DB with queries, consuming free-tier transfer quota.

## Current intervals (after fix)
| Component | Before | After |
|---|---|---|
| RecentFeed (home) | 10s | 60s |
| ReferralDashboardModal | 15s | 60s |
| ReferralManagement claim requests | 10s | 60s |
| Navbar announcements | 30s | 120s |
| Admin Stats | 30s | 120s |
| DashboardHome stats | 30s | 120s |
| ReferralManagement users | 30s | 120s |

**Why:** Even with low real-user traffic, long admin panel sessions or multiple browser tabs with short polling intervals can exhaust free-tier DB transfer limits within days.

**How to apply:** Any new polling component should use refetchInterval ≥ 60000 (1 min) for user-facing and ≥ 120000 (2 min) for admin-only queries.
