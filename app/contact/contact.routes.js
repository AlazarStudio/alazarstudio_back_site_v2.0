import express from "express"
import { sendContactRequest } from "./contact.controller.js"
import { validateRequest } from "../middleware/validation.middleware.js"

const router = express.Router()

const validateContactRequest = validateRequest([
  { field: "name", required: true, minLength: 2, maxLength: 120 },
  {
    field: "phone",
    required: true,
    minLength: 5,
    maxLength: 40,
    custom: (value) => /^[0-9+\-() ]+$/.test(String(value)),
    customError: "phone must contain only digits and phone symbols",
  },
  { field: "email", required: false, isEmail: true, maxLength: 160 },
  { field: "message", required: true, minLength: 5, maxLength: 5000 },
  { field: "source", required: false, maxLength: 120 },
])

router.post("/request", validateContactRequest, sendContactRequest)

export default router
