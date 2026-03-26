import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  getContactsStructure,
  updateContactsStructure
} from "./contactsStructure.controller.js"

const router = express.Router()

router
  .route("/")
  .get(protect, getContactsStructure)
  .put(protect, updateContactsStructure)

export default router
