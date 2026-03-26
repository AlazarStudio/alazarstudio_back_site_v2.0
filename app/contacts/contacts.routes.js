import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  getContactss,
  getContactsById,
  createContacts,
  updateContacts,
  deleteContacts
} from "./contacts.controller.js"

const router = express.Router()

router
  .route("/")
  .get(protect, getContactss)
  .post(protect, createContacts)

router
  .route("/:id")
  .get(protect, getContactsById)
  .put(protect, updateContacts)
  .delete(protect, deleteContacts)

export default router
