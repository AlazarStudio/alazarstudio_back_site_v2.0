import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  getFilters,
  getFilterById,
  createFilter,
  updateFilter,
  deleteFilter
} from "./filter.controller.js"

const router = express.Router()

router
  .route("/")
  .get(protect, getFilters)
  .post(protect, createFilter)

router
  .route("/:id")
  .get(protect, getFilterById)
  .put(protect, updateFilter)
  .delete(protect, deleteFilter)

export default router
