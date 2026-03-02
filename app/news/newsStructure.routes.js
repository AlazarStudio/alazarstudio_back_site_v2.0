import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  getNewsStructure,
  updateNewsStructure
} from "./newsStructure.controller.js"

const router = express.Router()

router
  .route("/")
  .get(protect, getNewsStructure)
  .put(protect, updateNewsStructure)

export default router
