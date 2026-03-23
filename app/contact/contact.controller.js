import asyncHandler from "express-async-handler"
import { sendContactEmail } from "../utils/mailer.utils.js"

// @desc    Send contact form email
// @route   POST /api/contact/request
// @access  Public
export const sendContactRequest = asyncHandler(async (req, res) => {
  const { name, phone, email, message, source } = req.body

  await sendContactEmail({ name, phone, email, message, source })

  res.status(200).json({
    success: true,
    message: "Сообщение отправлено",
  })
})
