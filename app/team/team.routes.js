import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  getTeams,
  getPublicTeams,
  getTeamById,
  createTeam,
  updateTeam,
  deleteTeam
} from "./team.controller.js"

const router = express.Router()

router.get("/public", getPublicTeams)

router
  .route("/")
  .get(protect, getTeams)
  .post(protect, createTeam)

router
  .route("/:id")
  .get(protect, getTeamById)
  .put(protect, updateTeam)
  .delete(protect, deleteTeam)

export default router
