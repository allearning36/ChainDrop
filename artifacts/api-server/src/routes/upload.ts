import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { requireAdmin } from "../lib/adminAuth";
import { supportLimiter } from "../lib/rateLimiters";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "stream";

// ── Magic-byte signatures for accepted image types ────────────────────────────
// Prevents attackers from renaming non-image files (scripts, executables) with
// an image extension and bypassing the mimetype-only check in multer.
const IMAGE_SIGNATURES: Array<{ mimes: string[]; bytes: number[] }> = [
  { mimes: ["image/jpeg"],                               bytes: [0xFF, 0xD8, 0xFF] },
  { mimes: ["image/png"],                                bytes: [0x89, 0x50, 0x4E, 0x47] },
  { mimes: ["image/gif"],                                bytes: [0x47, 0x49, 0x46, 0x38] },
  { mimes: ["image/webp"],                               bytes: [0x52, 0x49, 0x46, 0x46] },
  { mimes: ["image/bmp"],                                bytes: [0x42, 0x4D] },
  { mimes: ["image/x-icon", "image/vnd.microsoft.icon"], bytes: [0x00, 0x00, 0x01, 0x00] },
];

function hasValidMagicBytes(buf: Buffer, mimetype: string): boolean {
  const sig = IMAGE_SIGNATURES.find(s => s.mimes.includes(mimetype));
  if (!sig) return false;
  return sig.bytes.every((b, i) => buf[i] === b);
}

function readFileMagic(file: Express.Multer.File): Buffer | null {
  try {
    if (file.buffer && file.buffer.length > 0) return file.buffer;
    if (file.path) {
      const fd = fs.openSync(file.path, "r");
      const buf = Buffer.alloc(8);
      fs.readSync(fd, buf, 0, 8, 0);
      fs.closeSync(fd);
      return buf;
    }
  } catch { /* ignore */ }
  return null;
}

const router: IRouter = Router();

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".ico", ".bmp"]);
const ALLOWED_MIMETYPES  = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/x-icon",
  "image/bmp", "image/vnd.microsoft.icon",
]);

const R2_ACCOUNT_ID      = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID   = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME     = process.env.R2_BUCKET_NAME;
const useR2 = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);

const r2 = useR2
  ? new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;

const memStorage = multer.memoryStorage();
const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : ".jpg";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${safeExt}`);
  },
});

export const upload = multer({
  storage: useR2 ? memStorage : diskStorage,
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

function buildUploadUrl(filename: string): string {
  const domains = (process.env.REPLIT_DOMAINS ?? "").split(",").map(d => d.trim()).filter(Boolean);
  if (domains.length > 0) return `https://${domains[0]}/api/uploads/${filename}`;
  return `/api/uploads/${filename}`;
}

function generateFilename(originalname: string): string {
  const ext = path.extname(originalname).toLowerCase();
  const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : ".jpg";
  return `${Date.now()}-${Math.random().toString(36).slice(2)}${safeExt}`;
}

// Support image upload — no admin required, any user can upload (for chat images)
// Rate-limited (supportLimiter: 10/hour) + magic-byte verified to prevent
// disguised file uploads.
router.post("/uploads/support", supportLimiter, upload.single("image"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No image file provided" });
    return;
  }

  const magicBuf = readFileMagic(req.file);
  if (!magicBuf || !hasValidMagicBytes(magicBuf, req.file.mimetype)) {
    if (req.file.path) { try { fs.unlinkSync(req.file.path); } catch { /* ignore */ } }
    res.status(400).json({ error: "Invalid image file content." });
    return;
  }

  if (useR2 && r2) {
    const filename = `support-${generateFilename(req.file.originalname)}`;
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME!,
      Key: filename,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));
    res.json({ url: buildUploadUrl(filename) });
  } else {
    res.json({ url: buildUploadUrl(req.file.filename!) });
  }
});

router.post("/uploads/banner", requireAdmin, upload.single("image"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No image file provided" });
    return;
  }

  const magicBuf = readFileMagic(req.file);
  if (!magicBuf || !hasValidMagicBytes(magicBuf, req.file.mimetype)) {
    if (req.file.path) { try { fs.unlinkSync(req.file.path); } catch { /* ignore */ } }
    res.status(400).json({ error: "Invalid image file content." });
    return;
  }

  if (useR2 && r2) {
    const filename = generateFilename(req.file.originalname);
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME!,
      Key: filename,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));
    res.json({ url: buildUploadUrl(filename) });
  } else {
    res.json({ url: buildUploadUrl(req.file.filename!) });
  }
});

router.get("/uploads/:filename", async (req, res): Promise<void> => {
  const rawFilename = req.params.filename as string;
  if (rawFilename.includes("\0")) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }
  const filename = path.basename(rawFilename);

  if (useR2 && r2) {
    try {
      const obj = await r2.send(new GetObjectCommand({
        Bucket: R2_BUCKET_NAME!,
        Key: filename,
      }));
      const contentType = obj.ContentType ?? "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      (obj.Body as Readable).pipe(res);
    } catch {
      res.status(404).json({ error: "File not found" });
    }
    return;
  }

  const filePath = path.join(UPLOADS_DIR, filename);
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
