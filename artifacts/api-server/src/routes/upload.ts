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

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

router.post("/uploads/banner", requireAdmin, upload.single("image"), (req, res): void => {
  if (!req.file) {
    res.status(400).json({ error: "No image file provided" });
    return;
  }
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const url = `${proto}://${host}/api/uploads/${req.file.filename}`;
  res.json({ url });
});

router.get("/uploads/:filename", (req, res): void => {
  const filename = path.basename(req.params.filename as string);
  const filePath = path.join(UPLOADS_DIR, filename);
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).json({ error: "File not found" });
  });
});

export default router;
