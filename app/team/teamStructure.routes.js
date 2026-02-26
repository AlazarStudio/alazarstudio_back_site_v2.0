import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  getTeamStructure,
  updateTeamStructure
} from "./teamStructure.controller.js"

const router = express.Router()

router
  .route("/")
  .get(protect, getTeamStructure)
  .put(protect, updateTeamStructure)

export default router
