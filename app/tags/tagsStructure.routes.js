import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  getTagsStructure,
  updateTagsStructure
} from "./tagsStructure.controller.js"

const router = express.Router()

router
  .route("/")
  .get(protect, getTagsStructure)
  .put(protect, updateTagsStructure)

export default router
