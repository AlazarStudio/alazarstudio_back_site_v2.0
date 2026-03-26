import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  getContactss,
  getPublicContactss,
  getContactsById,
  createContacts,
  updateContacts,
  deleteContacts
} from "./contacts.controller.js"

const router = express.Router()

router.get("/public", getPublicContactss)

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
