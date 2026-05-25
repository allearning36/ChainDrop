import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { requireAdmin } from "../lib/adminAuth";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "stream";

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
router.post("/uploads/support", upload.single("image"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No image file provided" });
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
