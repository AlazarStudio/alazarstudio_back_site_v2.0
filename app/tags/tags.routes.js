import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  getTagss,
  getTagsById,
  createTags,
  updateTags,
  deleteTags
} from "./tags.controller.js"

const router = express.Router()

router
  .route("/")
  .get(protect, getTagss)
  .post(protect, createTags)

router
  .route("/:id")
  .get(protect, getTagsById)
  .put(protect, updateTags)
  .delete(protect, deleteTags)

export default router
