import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  getNewss,
  getPublicNewss,
  getNewsById,
  createNews,
  updateNews,
  deleteNews
} from "./news.controller.js"

const router = express.Router()

router.get("/public", getPublicNewss)

router
  .route("/")
  .get(protect, getNewss)
  .post(protect, createNews)

router
  .route("/:id")
  .get(protect, getNewsById)
  .put(protect, updateNews)
  .delete(protect, deleteNews)

export default router
