import rateLimit from "express-rate-limit";

// ── Per-wallet in-memory rate limiter ────────────────────────────────────────
// Limits claim attempts per wallet address (independent of IP).
// 30 attempts per 15 minutes per wallet (multiple chains in one session).
const WALLET_WINDOW_MS = 15 * 60 * 1000;
const WALLET_MAX = 30;
const walletCounters = new Map<string, { count: number; resetAt: number }>();

// Cleanup expired entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of walletCounters) {
    if (now > v.resetAt) walletCounters.delete(k);
  }
}, 60 * 60 * 1000);

export function checkWalletRateLimit(wallet: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const key = wallet.toLowerCase();
  const entry = walletCounters.get(key);
  if (!entry || now > entry.resetAt) {
    walletCounters.set(key, { count: 1, resetAt: now + WALLET_WINDOW_MS });
    return { allowed: true, retryAfterMs: 0 };
  }
  entry.count++;
  if (entry.count > WALLET_MAX) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }
  return { allowed: true, retryAfterMs: 0 };
}

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
});

export const claimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many claim attempts. Please wait before trying again." },
});

export const supportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many support requests. Please try again later." },
});

export const lookupLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many lookup requests. Please slow down." },
});

export const buyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many buy requests. Please wait before trying again." },
});

export const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests." },
});

// Nonce endpoint: 10 per minute per IP
export const nonceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many nonce requests. Please slow down." },
});

// Admin abuse endpoints
export const adminAbuseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests." },
});
