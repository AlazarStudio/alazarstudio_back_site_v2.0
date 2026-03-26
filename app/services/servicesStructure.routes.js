import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  getServicesStructure,
  updateServicesStructure
} from "./servicesStructure.controller.js"

const router = express.Router()

router
  .route("/")
  .get(protect, getServicesStructure)
  .put(protect, updateServicesStructure)

export default router
