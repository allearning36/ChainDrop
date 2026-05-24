import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { globalLimiter } from "./lib/rateLimiters";

// ── Honeypot: paths that only scanners/bots would hit ─────────────────────────
const HONEYPOT_PATHS = [
  "/wp-admin", "/wp-login", "/wordpress", "/.env", "/config.php",
  "/phpinfo", "/admin.php", "/setup.php", "/install.php", "/xmlrpc.php",
  "/api/debug", "/api/env", "/actuator", "/.git", "/server-status",
  "/phpmyadmin", "/mysql", "/administrator", "/.aws", "/.ssh",
  "/api/v1/debug", "/console", "/jmx-console", "/web-console",
];
// In-memory honeypot bans (ip → ban expiry timestamp). Single-process safe.
const honeypotBans = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [ip, exp] of honeypotBans) { if (now > exp) honeypotBans.delete(ip); }
}, 10 * 60 * 1000);

const app: Express = express();

// Trust the first proxy hop (Replit's reverse proxy sets X-Forwarded-For).
// Without this, express-rate-limit cannot identify real client IPs and throws
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
app.set("trust proxy", 1);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", "data:", "https:"],
      connectSrc:  ["'self'", "https:"],
      fontSrc:     ["'self'", "https:"],
      objectSrc:   ["'none'"],
      frameSrc:    ["'none'"],
      baseUri:     ["'self'"],
      formAction:  ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
  strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));

// ── Honeypot trap — auto-ban scanners/bots ────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const p = req.path.toLowerCase();
  const triggered = HONEYPOT_PATHS.some(h => p === h || p.startsWith(h + "/"));
  if (!triggered) return next();
  const ip = (req.ip ?? req.socket?.remoteAddress ?? "").replace(/^::ffff:/, "");
  honeypotBans.set(ip, Date.now() + 24 * 60 * 60 * 1000); // 24h ban
  logger.warn({ ip, path: req.path }, "Honeypot triggered — IP banned 24h");
  res.status(404).json({ error: "Not found" });
});

// ── Reject IPs banned by honeypot before they reach any API route ─────────────
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  const ip = (req.ip ?? req.socket?.remoteAddress ?? "").replace(/^::ffff:/, "");
  const banExp = honeypotBans.get(ip);
  if (banExp && Date.now() < banExp) {
    return res.status(429).json({ error: "Too many requests." });
  }
  return next();
});

// ── CORS — restrict to own Replit domains + any extra origins in production ───
const replitDomains = (process.env.REPLIT_DOMAINS ?? "").split(",").map(d => d.trim()).filter(Boolean);
const extraOrigins = (process.env.ALLOWED_ORIGINS ?? "").split(",").map(d => d.trim()).filter(Boolean);
// Normalize: ensure every entry has https:// prefix
const normalizeOrigin = (o: string) => o.startsWith("http") ? o : `https://${o}`;
const allowedOrigins = [
  ...replitDomains.map(d => `https://${d}`),
  ...extraOrigins.map(normalizeOrigin),
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.length === 0 ||
      allowedOrigins.some(o => origin === o) ||
      origin.startsWith("http://localhost") ||
      origin.endsWith(".vercel.app") ||
      origin.endsWith(".railway.app") ||
      origin.endsWith(".replit.app") ||
      origin.endsWith(".replit.dev") ||
      origin === "https://chaindrop.app" ||
      origin === "https://www.chaindrop.app"
    ) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

// ── Logging ───────────────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(globalLimiter);
// Explicit body size limits to prevent payload-flooding attacks
app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ limit: "50kb", extended: true }));

app.use("/api", router);

// ── Global JSON error handler ─────────────────────────────────────────────────
// Must be defined AFTER all routes. Catches any unhandled error thrown inside
// a route handler and returns a JSON response instead of Express's HTML page.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use("/api", (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled route error");
  if (!res.headersSent) {
    res.status(500).json({ error: "An unexpected error occurred. Please try again." });
  }
});

// ── Serve faucet-hub static frontend (production) ────────────────────────────
// In production the frontend is built to artifacts/faucet-hub/dist/public.
// __dirname resolves to artifacts/api-server/dist at runtime.
const frontendDist = path.resolve(
  __dirname,
  "..",
  "..",
  "faucet-hub",
  "dist",
  "public",
);

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback — serve index.html for any non-API route (Express 5: use /{*path})
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
  logger.info({ frontendDist }, "Serving frontend static files");
}

export default app;
