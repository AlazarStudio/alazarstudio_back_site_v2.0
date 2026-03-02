import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  getStockss,
  getPublicStockss,
  getStocksById,
  createStocks,
  updateStocks,
  deleteStocks
} from "./stocks.controller.js"

const router = express.Router()

router.get("/public", getPublicStockss)

router
  .route("/")
  .get(protect, getStockss)
  .post(protect, createStocks)

router
  .route("/:id")
  .get(protect, getStocksById)
  .put(protect, updateStocks)
  .delete(protect, deleteStocks)

export default router
