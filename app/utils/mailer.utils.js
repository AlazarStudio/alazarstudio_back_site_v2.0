import nodemailer from "nodemailer"

const toBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback
  return String(value).toLowerCase() === "true"
}

const getSmtpConfig = () => {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 587)
  const secure = toBool(process.env.SMTP_SECURE, port === 465)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS")
  }

  return {
    host,
    port,
    secure,
    auth: { user, pass },
  }
}

let transporter = null

const getTransporter = () => {
  if (transporter) return transporter
  transporter = nodemailer.createTransport(getSmtpConfig())
  return transporter
}

export const sendContactEmail = async ({
  name,
  phone,
  email,
  message,
  source,
}) => {
  const mailFrom = process.env.MAIL_FROM || process.env.SMTP_USER
  const mailTo = process.env.MAIL_TO || "info@alazarstudio.ru"

  const safeName = String(name || "").trim()
  const safePhone = String(phone || "").trim()
  const safeEmail = String(email || "").trim()
  const safeMessage = String(message || "").trim()
  const safeSource = String(source || "").trim()

  const text = [
    "Новая заявка с сайта",
    "",
    `Имя: ${safeName}`,
    `Телефон: ${safePhone}`,
    `Email: ${safeEmail || "-"}`,
    `Источник: ${safeSource || "-"}`,
    "",
    "Сообщение:",
    safeMessage,
  ].join("\n")

  const html = `
    <p><strong>Имя:</strong> ${safeName}</p>
    <p><strong>Телефон:</strong> ${safePhone}</p>
    <p><strong>Email:</strong> ${safeEmail || "-"}</p>
    <p><strong>Источник:</strong> ${safeSource || "-"}</p>
    <p><strong>Сообщение:</strong></p>
    <p>${safeMessage.replace(/\n/g, "<br/>")}</p>
  `

  const info = await getTransporter().sendMail({
    from: mailFrom,
    to: mailTo,
    replyTo: safeEmail || undefined,
    subject: "Новая заявка с сайта алазар.рф",
    text,
    html,
  })

  return info
}
