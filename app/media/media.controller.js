import fs from "fs"
import path from "path"
import asyncHandler from "express-async-handler"
import multer from "multer"
import sharp from "sharp"

const uploadsDir = path.resolve("uploads")

// Форматы с анимацией — не конвертируем в webp, иначе анимация теряется
const ANIMATED_IMAGE_MIMETYPES = ["image/gif"]
const ANIMATED_EXTENSIONS = [".gif"]
const MAX_IMAGE_DIMENSION = 2560
const WEBP_QUALITY = 78
const WEBP_EFFORT = 6

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true })
      }
      cb(null, uploadsDir)
    } catch (error) {
      cb(error)
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase()
    const base = path
      .basename(file.originalname || "file", ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 64)
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `${base || "file"}-${unique}${ext}`)
  },
})

export const upload = multer({ storage })

// @desc    Upload media file
// @route   POST /api/admin/media/upload
// @access  Private (Admin)
export const uploadMedia = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400)
    throw new Error("No file uploaded")
  }

  const fileExt = path.extname(req.file.filename || "").toLowerCase()
  const isImage = typeof req.file.mimetype === "string" && req.file.mimetype.startsWith("image/")
  const isAlreadyWebp = req.file.mimetype === "image/webp" || fileExt === ".webp"
  const isAnimated =
    ANIMATED_IMAGE_MIMETYPES.includes(req.file.mimetype) || ANIMATED_EXTENSIONS.includes(fileExt)
  let filename = req.file.filename
  let url = `/uploads/${filename}`
  let mimetype = req.file.mimetype
  let size = req.file.size

  if (isImage && !isAlreadyWebp && !isAnimated) {
    const inputPath = req.file.path
    const parsed = path.parse(req.file.filename)
    const webpFilename = `${parsed.name}.webp`
    const webpPath = path.join(uploadsDir, webpFilename)

    try {
      let pipeline = sharp(inputPath).rotate()
      const meta = await pipeline.metadata()
      const w = meta.width || 0
      const h = meta.height || 0
      if (w > MAX_IMAGE_DIMENSION || h > MAX_IMAGE_DIMENSION) {
        pipeline = pipeline.resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
          fit: "inside",
          withoutEnlargement: true,
        })
      }
      await pipeline
        .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
        .toFile(webpPath)
      fs.unlinkSync(inputPath)
      const stats = fs.statSync(webpPath)
      filename = webpFilename
      url = `/uploads/${filename}`
      mimetype = "image/webp"
      size = stats.size
    } catch (error) {
      if (fs.existsSync(webpPath)) fs.unlinkSync(webpPath)
      // Если конвертация недоступна для конкретного изображения,
      // не валим загрузку и оставляем оригинальный файл.
      console.warn("Image conversion skipped, keeping original file:", error?.message || error)
    }
  }

  res.status(201).json({
    url,
    filename,
    mimetype,
    size,
  })
})

// @desc    Crop image (GIF не кропаем — сохраняем как есть)
// @route   POST /api/admin/media/crop
// @access  Private (Admin)
// Body: multipart file + cropX, cropY, cropWidth, cropHeight (числа)
export const cropMedia = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400)
    throw new Error("No file uploaded")
  }

  const x = Number(req.body.cropX)
  const y = Number(req.body.cropY)
  const w = Number(req.body.cropWidth)
  const h = Number(req.body.cropHeight)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
    res.status(400)
    throw new Error("Invalid crop: cropX, cropY, cropWidth, cropHeight must be valid numbers")
  }

  const inputPath = req.file.path
  const fileExt = path.extname(req.file.filename || "").toLowerCase()
  const mimetype = (req.file.mimetype || "").toLowerCase()
  const isGif = mimetype === "image/gif" || fileExt === ".gif"

  if (isGif) {
    const parsed = path.parse(req.file.filename)
    const outFilename = `${parsed.name}-cropped${parsed.ext}`
    const outputPath = path.join(uploadsDir, outFilename)
    fs.copyFileSync(inputPath, outputPath)
    fs.unlinkSync(inputPath)
    const stats = fs.statSync(outputPath)
    return res.status(201).json({
      url: `/uploads/${outFilename}`,
      filename: outFilename,
      mimetype: "image/gif",
      size: stats.size,
    })
  }

  // Не-GIF: кроп через sharp, затем как при обычном upload (webp и т.д.)
  const parsed = path.parse(req.file.filename)
  const isImage = mimetype.startsWith("image/")
  const isAlreadyWebp = mimetype === "image/webp" || fileExt === ".webp"
  const isAnimated = ANIMATED_IMAGE_MIMETYPES.includes(mimetype) || ANIMATED_EXTENSIONS.includes(fileExt)

  let pipeline = sharp(inputPath).extract({
    left: Math.round(x),
    top: Math.round(y),
    width: Math.round(w),
    height: Math.round(h),
  }).rotate()

  if (isImage && !isAlreadyWebp && !isAnimated) {
    const webpFilename = `${parsed.name}-cropped.webp`
    const webpPath = path.join(uploadsDir, webpFilename)
    try {
      const meta = await pipeline.metadata()
      const width = meta.width || w
      const height = meta.height || h
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        pipeline = pipeline.resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
          fit: "inside",
          withoutEnlargement: true,
        })
      }
      await pipeline.webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT }).toFile(webpPath)
      fs.unlinkSync(inputPath)
      const stats = fs.statSync(webpPath)
      return res.status(201).json({
        url: `/uploads/${webpFilename}`,
        filename: webpFilename,
        mimetype: "image/webp",
        size: stats.size,
      })
    } catch (error) {
      if (fs.existsSync(webpPath)) try { fs.unlinkSync(webpPath) } catch (_) {}
      pipeline = sharp(inputPath)
        .extract({ left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(h) })
        .rotate()
    }
  }

  // Оставить как есть (например PNG после кропа или fallback после ошибки webp)
  const outFilename = `${parsed.name}-cropped${fileExt || ".png"}`
  const outputPath = path.join(uploadsDir, outFilename)
  try {
    await pipeline.toFile(outputPath)
    fs.unlinkSync(inputPath)
    const stats = fs.statSync(outputPath)
    return res.status(201).json({
      url: `/uploads/${outFilename}`,
      filename: outFilename,
      mimetype: req.file.mimetype,
      size: stats.size,
    })
  } finally {
    if (fs.existsSync(inputPath)) try { fs.unlinkSync(inputPath) } catch (_) {}
  }
})
