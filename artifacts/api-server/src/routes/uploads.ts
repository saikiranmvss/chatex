import { Router, type IRouter } from "express";
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireAuth } from "../lib/auth";
import { MAX_UPLOAD_BYTES, UPLOAD_DIR } from "../lib/uploads";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const router: IRouter = Router();

router.post("/uploads", requireAuth, upload.single("file"), (req, res): void => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  res.status(201).json({
    url: `/api/uploads/${req.file.filename}`,
    mediaType: req.file.mimetype,
    mediaSize: req.file.size,
    mediaName: req.file.originalname,
  });
});

export default router;
