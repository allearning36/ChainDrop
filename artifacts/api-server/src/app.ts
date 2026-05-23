import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { globalLimiter } from "./lib/rateLimiters";

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
  crossOriginResourcePolicy: false,   // allow images/fonts served cross-origin
  crossOriginOpenerPolicy: false,
  // Strict Transport Security — tell browsers to use HTTPS for 1 year
  strictTransportSecurity: {
    maxAge: 31_536_000,
    includeSubDomains: true,
  },
}));

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
  // SPA fallback — serve index.html for any non-API route
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
  logger.info({ frontendDist }, "Serving frontend static files");
}

export default app;
