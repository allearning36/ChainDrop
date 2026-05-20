import jwt from "jsonwebtoken";
import { type Request, type Response, type NextFunction } from "express";

// ── JWT ──────────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.SESSION_SECRET;
if (!JWT_SECRET) {
  // Crash loudly at startup rather than silently using a weak fallback
  throw new Error("SESSION_SECRET environment variable is not set. Server will not start.");
}

export function signAdminToken(): string {
  return jwt.sign({ role: "admin" }, JWT_SECRET!, { expiresIn: "24h" });
}

export function verifyAdminToken(token: string): boolean {
  try {
    jwt.verify(token, JWT_SECRET!);
    return true;
  } catch {
    return false;
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = auth.slice(7);
  if (!verifyAdminToken(token)) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  next();
}

// ── Brute-force protection ────────────────────────────────────────────────────
// Simple in-memory rate limiter for /admin/auth.
// Tracks failed attempts per IP. After MAX_ATTEMPTS failures within WINDOW_MS
// the IP is locked out for LOCKOUT_MS.

const MAX_ATTEMPTS = 5;           // max wrong passwords before lockout
const WINDOW_MS    = 15 * 60 * 1000; // 15-minute sliding window
const LOCKOUT_MS   = 15 * 60 * 1000; // 15-minute lockout after too many failures

interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
  lockedUntil: number | null;
}

const attempts = new Map<string, AttemptRecord>();

// Clean up stale entries every 30 minutes so memory doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of attempts) {
    const expired = rec.lockedUntil
      ? now > rec.lockedUntil
      : now - rec.firstAttemptAt > WINDOW_MS;
    if (expired) attempts.delete(ip);
  }
}, 30 * 60 * 1000);

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "unknown";
}

/** Call this on every login attempt. Returns an error message if blocked, null if allowed. */
export function checkLoginRateLimit(req: Request): string | null {
  const ip = getClientIp(req);
  const now = Date.now();
  const rec = attempts.get(ip);

  if (rec) {
    // Currently locked out?
    if (rec.lockedUntil && now < rec.lockedUntil) {
      const remaining = Math.ceil((rec.lockedUntil - now) / 60000);
      return `Too many failed attempts. Try again in ${remaining} minute${remaining !== 1 ? "s" : ""}.`;
    }
    // Window expired — reset
    if (now - rec.firstAttemptAt > WINDOW_MS) {
      attempts.delete(ip);
    }
  }

  return null; // allowed
}

/** Call this after a FAILED login attempt. */
export function recordFailedLogin(req: Request): void {
  const ip = getClientIp(req);
  const now = Date.now();
  const rec = attempts.get(ip);

  if (!rec || now - rec.firstAttemptAt > WINDOW_MS) {
    attempts.set(ip, { count: 1, firstAttemptAt: now, lockedUntil: null });
    return;
  }

  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = now + LOCKOUT_MS;
  }
}

/** Call this after a SUCCESSFUL login — clears the record for that IP. */
export function recordSuccessfulLogin(req: Request): void {
  const ip = getClientIp(req);
  attempts.delete(ip);
}
