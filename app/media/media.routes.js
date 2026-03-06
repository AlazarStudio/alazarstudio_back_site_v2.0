import express from "express"
import { protect, admin } from "../middleware/auth.middleware.js"
import { upload, uploadMedia, cropMedia } from "./media.controller.js"

const router = express.Router()

router.post("/upload", protect, admin, upload.single("file"), uploadMedia)
router.post("/upload-document", protect, admin, upload.single("file"), uploadMedia)
router.post("/upload-video", protect, admin, upload.single("file"), uploadMedia)
router.post("/crop", protect, admin, upload.single("file"), cropMedia)

export default router
