import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { requireAdmin } from "../lib/adminAuth";

const router: IRouter = Router();

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// SVG is intentionally excluded — SVG can embed arbitrary JS (XSS risk).
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".ico", ".bmp"]);
const ALLOWED_MIMETYPES  = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/x-icon",
  "image/bmp", "image/vnd.microsoft.icon",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Use a known-safe extension even if client sends no extension
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : ".jpg";
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}${safeExt}`;
    cb(null, unique);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_MIMETYPES.has(file.mimetype) && ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files (JPG, PNG, GIF, WebP, BMP, ICO) are allowed. SVG is not permitted."));
    }
  },
});

/** Build a public URL for a stored upload using the canonical domain. */
function buildUploadUrl(filename: string): string {
  const domains = (process.env.REPLIT_DOMAINS ?? "").split(",").map(d => d.trim()).filter(Boolean);
  if (domains.length > 0) {
    return `https://${domains[0]}/api/uploads/${filename}`;
  }
  // Fallback for local dev
  return `/api/uploads/${filename}`;
}

router.post("/uploads/banner", requireAdmin, upload.single("image"), (req, res): void => {
  if (!req.file) {
    res.status(400).json({ error: "No image file provided" });
    return;
  }
  res.json({ url: buildUploadUrl(req.file.filename) });
});

router.get("/uploads/:filename", (req, res): void => {
  const rawFilename = req.params.filename as string;
  // Reject null bytes (path traversal via null-byte injection)
  if (rawFilename.includes("\0")) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }
  const filename = path.basename(rawFilename);
  const filePath = path.join(UPLOADS_DIR, filename);
  // Prevent directory traversal — path.basename already strips any path,
  // but ensure the resolved path is still inside UPLOADS_DIR.
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }
  res.sendFile(resolved, (err) => {
    if (err) res.status(404).json({ error: "File not found" });
  });
});

export default router;
