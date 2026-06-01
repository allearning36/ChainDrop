import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import { eq } from "drizzle-orm";
import router from "./routes";
import { logger } from "./lib/logger";
import { startOrderRecoveryWorker } from "./routes/exchange";
import { globalLimiter } from "./lib/rateLimiters";
import { db, settingsTable } from "@workspace/db";

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

// ── Compression — reduces Railway bandwidth ~60% for JSON/text responses ──────
app.use(compression());

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

app.use((req, res, next) => {
  if (req.path.startsWith("/api/admin/") || req.path.startsWith("/api/uploads/")) return next();
  return globalLimiter(req, res, next);
});
// Admin routes may send base64 logo data — allow up to 8 MB
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ limit: "8mb", extended: true }));

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

// ── ads.txt — reads publisher ID from DB (admin-configurable) ────────────────
app.get("/ads.txt", async (_req, res) => {
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "integrations")).limit(1);
    const cfg: { googleAds?: { publisherId?: string } } = row?.value ? JSON.parse(row.value) : {};
    const pubId = cfg.googleAds?.publisherId?.replace("ca-pub-", "").trim() || "9927771832666022";
    res.type("text/plain");
    res.send(`google.com, pub-${pubId}, DIRECT, f08c47fec0942fa0\n`);
  } catch {
    res.type("text/plain");
    res.send("google.com, pub-9927771832666022, DIRECT, f08c47fec0942fa0\n");
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

  // Read index.html once at startup; replace at request time with DB-driven SEO meta
  const indexHtmlPath = path.join(frontendDist, "index.html");
  let indexHtmlTemplate = fs.readFileSync(indexHtmlPath, "utf-8");
  // Refresh template when the file changes (Vercel hot-swap, etc.)
  fs.watch(indexHtmlPath, () => {
    try { indexHtmlTemplate = fs.readFileSync(indexHtmlPath, "utf-8"); } catch { /* ignore */ }
  });

  // 5-minute in-memory cache for SEO + integrations (avoids a DB round-trip per crawl)
  let seoCache: { title: string; description: string; ogImage: string; ts: number } | null = null;
  let integrationsCache: {
    adsenseEnabled: boolean; adsensePublisherId: string;
    gscCode: string;
    ts: number;
  } | null = null;

  // SPA fallback — inject live SEO meta + AdSense from DB, then serve index.html
  app.get("/{*path}", async (req: Request, res: Response) => {
    try {
      const now = Date.now();

      // Refresh SEO cache every 5 minutes
      if (!seoCache || now - seoCache.ts > 5 * 60 * 1000) {
        const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "seoSettings")).limit(1);
        const seo: { title?: string; description?: string; ogImage?: string } =
          row?.value ? JSON.parse(row.value) : {};
        seoCache = {
          title:       seo.title       || "ChainDrop — Your Ultimate Faucet Hub",
          description: seo.description || "ChainDrop — Multi-chain crypto faucet hub. Get free testnet tokens instantly.",
          ogImage:     seo.ogImage     || "https://chaindrop.app/opengraph.jpg",
          ts: now,
        };
      }

      // Refresh integrations cache every 5 minutes
      if (!integrationsCache || now - integrationsCache.ts > 5 * 60 * 1000) {
        const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "integrations")).limit(1);
        const cfg: {
          googleAds?: { enabled?: boolean; publisherId?: string };
          googleSearchConsole?: { verificationCode?: string };
        } = row?.value ? JSON.parse(row.value) : {};
        integrationsCache = {
          adsenseEnabled:     cfg.googleAds?.enabled     ?? false,
          adsensePublisherId: cfg.googleAds?.publisherId ?? "",
          gscCode:            cfg.googleSearchConsole?.verificationCode ?? "",
          ts: now,
        };
      }

      // Ensure og:image is an absolute URL so crawlers can fetch it
      let ogImage = seoCache.ogImage;
      if (ogImage && ogImage.startsWith("/")) {
        const proto = req.get("x-forwarded-proto") || req.protocol;
        const host  = req.get("x-forwarded-host")  || req.get("host") || "chaindrop.app";
        ogImage = `${proto}://${host}${ogImage}`;
      }

      // Build head injection snippet (AdSense always-on + Search Console)
      const headInjection: string[] = [
        `<meta name="google-adsense-account" content="ca-pub-9927771832666022">`,
        `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9927771832666022" crossorigin="anonymous"></script>`,
      ];
      if (integrationsCache.gscCode) {
        headInjection.push(
          `<meta name="google-site-verification" content="${integrationsCache.gscCode}">`
        );
      }

      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      let html = indexHtmlTemplate
        .replace(/(<title>)[^<]*(<\/title>)/,                           `$1${esc(seoCache.title)}$2`)
        .replace(/(<meta property="og:title" content=")[^"]*(")/,       `$1${esc(seoCache.title)}$2`)
        .replace(/(<meta property="og:description" content=")[^"]*(")/,  `$1${esc(seoCache.description)}$2`)
        .replace(/(<meta property="og:image" content=")[^"]*(")/,        `$1${esc(ogImage)}$2`)
        .replace(/(<meta name="twitter:title" content=")[^"]*(")/,       `$1${esc(seoCache.title)}$2`)
        .replace(/(<meta name="twitter:description" content=")[^"]*(")/,  `$1${esc(seoCache.description)}$2`)
        .replace(/(<meta name="twitter:image" content=")[^"]*(")/,        `$1${esc(ogImage)}$2`);

      // Inject AdSense + GSC tags before </head>
      if (headInjection.length > 0) {
        html = html.replace("</head>", `${headInjection.join("\n")}\n</head>`);
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.send(html);
    } catch {
      // Fallback to plain static file if DB is unavailable
      res.sendFile(indexHtmlPath);
    }
  });

  logger.info({ frontendDist }, "Serving frontend static files");
}

// Start background workers
startOrderRecoveryWorker();

export default app;
