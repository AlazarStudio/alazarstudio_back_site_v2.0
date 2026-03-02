import dotenv from "dotenv"
import express from "express"
import morgan from "morgan"
import path from "path"
import fs from "fs"
import http from "http"
import https from "https"

import { errorHandler, notFound } from "./app/middleware/error.middleware.js"
import { prisma } from "./app/prisma.js"

import authRoutes from "./app/auth/auth.routes.js"
import userRoutes from "./app/user/user.routes.js"
import configRoutes from "./app/config/config.routes.js"
import generateRoutes from "./app/generate/generate.routes.js"
import mediaRoutes from "./app/media/media.routes.js"
import menuRoutes from "./app/menu/menu.routes.js"
import menuStructureRoutes from "./app/menu/menuStructure.routes.js"
import casesRoutes from "./app/cases/cases.routes.js"
import casesStructureRoutes from "./app/cases/casesStructure.routes.js"
import tagsRoutes from "./app/tags/tags.routes.js"
import tagsStructureRoutes from "./app/tags/tagsStructure.routes.js"
import teamRoutes from "./app/team/team.routes.js"
import teamStructureRoutes from "./app/team/teamStructure.routes.js"
import newsRoutes from "./app/news/news.routes.js"
import newsStructureRoutes from "./app/news/newsStructure.routes.js"
import stocksRoutes from "./app/stocks/stocks.routes.js"
import stocksStructureRoutes from "./app/stocks/stocksStructure.routes.js"

import cors from "cors"

dotenv.config()

const app = express()
const requestBodyLimit = process.env.REQUEST_BODY_LIMIT || "50mb"
const importBodyLimit = process.env.REQUEST_IMPORT_BODY_LIMIT || "1gb"

// Настройка CORS для работы с фронтендом
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'https://alazarstudio.ru'], 
  credentials: true, // Разрешаем отправку cookies и авторизационных заголовков
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

async function main() {
  const nodeEnv = process.env.NODE_ENV
  const isDevEnv = nodeEnv === "dev" || nodeEnv === "development"

  if (isDevEnv) app.use(morgan("dev"))

  app.use("/api/admin/data/import", express.json({ limit: importBodyLimit }))
  app.use(express.json({ limit: requestBodyLimit }))
  app.use(express.urlencoded({ extended: true, limit: requestBodyLimit }))

  const __dirname = path.resolve()

  app.use("/uploads", express.static(path.join(__dirname, "/uploads/")))
  app.use("/config.json", express.static(path.join(__dirname, "/public/config.json")))

  app.use("/api/auth", authRoutes)
  app.use("/api/users", userRoutes)
  app.use("/api/config", configRoutes)
  app.use("/api/admin", generateRoutes)
  app.use("/api/admin/media", mediaRoutes)
  app.use("/api/menu", menuRoutes)
  app.use("/api/menuStructure", menuStructureRoutes)
  app.use("/api/cases", casesRoutes)
  app.use("/api/casesStructure", casesStructureRoutes)
  app.use("/api/tags", tagsRoutes)
  app.use("/api/tagsStructure", tagsStructureRoutes)
  app.use("/api/team", teamRoutes)
  app.use("/api/teamStructure", teamStructureRoutes)
  app.use("/api/news", newsRoutes)
  app.use("/api/newsStructure", newsStructureRoutes)
  app.use("/api/stocks", stocksRoutes)
  app.use("/api/stocksStructure", stocksStructureRoutes)

  app.use(notFound)
  app.use(errorHandler)

  const PORT = process.env.PORT || (nodeEnv === "production" ? 443 : 5000)

  let server
  let protocol = "http"
  const sslKeyPath = process.env.SSL_KEY_PATH
  const sslCertPath = process.env.SSL_CERT_PATH
  const hasSslPaths = Boolean(sslKeyPath && sslCertPath)

  if (nodeEnv === "production") {
    if (!hasSslPaths) {
      throw new Error("Для production (HTTPS) укажите SSL_KEY_PATH и SSL_CERT_PATH в .env")
    }

    const resolvedSslKeyPath = path.resolve(sslKeyPath)
    const resolvedSslCertPath = path.resolve(sslCertPath)

    if (!fs.existsSync(resolvedSslKeyPath) || !fs.existsSync(resolvedSslCertPath)) {
      throw new Error("SSL_KEY_PATH или SSL_CERT_PATH указывают на несуществующие файлы")
    }

    protocol = "https"
    server = https.createServer(
      {
        key: fs.readFileSync(resolvedSslKeyPath),
        cert: fs.readFileSync(resolvedSslCertPath),
      },
      app
    )
  } else if (isDevEnv) {
    server = http.createServer(app)
  } else {
    throw new Error('NODE_ENV должен быть "production", "dev" или "development"')
  }

  server.listen(PORT, () => {
    console.log(`Server running in ${nodeEnv} on ${protocol}://localhost:${PORT}`)
  })

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log(`SIGTERM signal received: closing ${protocol.toUpperCase()} server`)
    server.close(async () => {
      await prisma.$disconnect()
      console.log(`${protocol.toUpperCase()} server closed`)
    })
  })

  process.on("SIGINT", async () => {
    console.log(`SIGINT signal received: closing ${protocol.toUpperCase()} server`)
    server.close(async () => {
      await prisma.$disconnect()
      console.log(`${protocol.toUpperCase()} server closed`)
      process.exit(0)
    })
  })
}

main().catch(async (e) => {
  console.error('❌ Критическая ошибка при запуске сервера:', e)
  await prisma.$disconnect()
  process.exit(1)
})

// Обработка необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason)
  // Не завершаем процесс, чтобы сервер продолжал работать
})

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error)
  // Не завершаем процесс, чтобы сервер продолжал работать
})
