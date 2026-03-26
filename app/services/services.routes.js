import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  getServicess,
  getServicesById,
  createServices,
  updateServices,
  deleteServices
} from "./services.controller.js"

const router = express.Router()

router
  .route("/")
  .get(protect, getServicess)
  .post(protect, createServices)

router
  .route("/:id")
  .get(protect, getServicesById)
  .put(protect, updateServices)
  .delete(protect, deleteServices)

export default router
