import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  getFiltrsaytas,
  getPublicFiltrsaytas,
  getFiltrsaytaById,
  createFiltrsayta,
  updateFiltrsayta,
  deleteFiltrsayta
} from "./filtrsayta.controller.js"

const router = express.Router()

router.get("/public", getPublicFiltrsaytas)

router
  .route("/")
  .get(protect, getFiltrsaytas)
  .post(protect, createFiltrsayta)

router
  .route("/:id")
  .get(protect, getFiltrsaytaById)
  .put(protect, updateFiltrsayta)
  .delete(protect, deleteFiltrsayta)

export default router
