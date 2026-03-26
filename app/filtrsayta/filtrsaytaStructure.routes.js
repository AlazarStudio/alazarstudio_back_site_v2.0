import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  getFiltrsaytaStructure,
  updateFiltrsaytaStructure
} from "./filtrsaytaStructure.controller.js"

const router = express.Router()

router
  .route("/")
  .get(protect, getFiltrsaytaStructure)
  .put(protect, updateFiltrsaytaStructure)

export default router
