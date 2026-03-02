import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  getStocksStructure,
  updateStocksStructure
} from "./stocksStructure.controller.js"

const router = express.Router()

router
  .route("/")
  .get(protect, getStocksStructure)
  .put(protect, updateStocksStructure)

export default router
