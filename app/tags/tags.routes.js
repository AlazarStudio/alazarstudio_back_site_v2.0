import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  getTagss,
  getPublicTagss,
  getTagsById,
  createTags,
  updateTags,
  deleteTags
} from "./tags.controller.js"

const router = express.Router()

router.get("/public", getPublicTagss)

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
