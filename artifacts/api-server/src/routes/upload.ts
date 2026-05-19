import { Router, type IRouter } from "express";
import path from "path";
import { requireAdmin } from "../lib/adminAuth";

const router: IRouter = Router();

router.use("/uploads", requireAdmin);

router.get("/uploads/:filename", (req, res): void => {
  const filename = path.basename(req.params.filename as string);
  const filePath = path.join(process.cwd(), "uploads", filename);
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).json({ error: "File not found" });
  });
});

export default router;
