/**
 * Post-build script: fetches live SEO settings from the API and injects
 * og:image / title / description into the built dist/public/index.html.
 *
 * Runs automatically after `vite build` via the "postbuild" npm script.
 * Failure is non-fatal — if the API is unreachable the built HTML keeps
 * whatever values are baked into the source index.html.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, "..", "dist", "public", "index.html");
const API_URL = "https://www.chaindrop.app/api/site-config/public";

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

async function main() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.warn("[inject-og] dist/public/index.html not found — skipping.");
    return;
  }

  let config = {};
  try {
    const res = await fetch(API_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) config = await res.json();
  } catch (err) {
    console.warn("[inject-og] API unavailable, keeping index.html defaults:", err.message);
    return;
  }

  const title       = config.seoTitle       || "";
  const description = config.seoDescription || "";
  let   ogImage     = config.seoOgImage     || "";

  if (!title && !description && !ogImage) {
    console.log("[inject-og] No SEO settings in DB yet — keeping index.html defaults.");
    return;
  }

  // Convert relative paths to absolute URLs (always use www to avoid redirect)
  if (ogImage && ogImage.startsWith("/")) {
    ogImage = `https://www.chaindrop.app${ogImage}`;
  }

  let html = fs.readFileSync(INDEX_PATH, "utf-8");

  if (title) {
    html = html
      .replace(/(<title>)[^<]*(<\/title>)/,                            `$1${esc(title)}$2`)
      .replace(/(<meta property="og:title" content=")[^"]*(")/,        `$1${esc(title)}$2`)
      .replace(/(<meta name="twitter:title" content=")[^"]*(")/,       `$1${esc(title)}$2`);
  }
  if (description) {
    html = html
      .replace(/(<meta name="description" content=")[^"]*(")/,             `$1${esc(description)}$2`)
      .replace(/(<meta property="og:description" content=")[^"]*(")/,      `$1${esc(description)}$2`)
      .replace(/(<meta name="twitter:description" content=")[^"]*(")/,     `$1${esc(description)}$2`);
  }
  if (ogImage) {
    html = html
      .replace(/(<meta property="og:image" content=")[^"]*(")/,        `$1${esc(ogImage)}$2`)
      .replace(/(<meta name="twitter:image" content=")[^"]*(")/,       `$1${esc(ogImage)}$2`);
  }

  fs.writeFileSync(INDEX_PATH, html, "utf-8");
  console.log("[inject-og] Injected SEO meta →", { title: title || "(unchanged)", ogImage: ogImage || "(unchanged)" });
}

main();
