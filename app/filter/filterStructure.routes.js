import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  getFilterStructure,
  updateFilterStructure
} from "./filterStructure.controller.js"

const router = express.Router()

router
  .route("/")
  .get(protect, getFilterStructure)
  .put(protect, updateFilterStructure)

export default router
