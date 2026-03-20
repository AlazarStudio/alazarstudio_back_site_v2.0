import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"

const MODEL_KEY = "news"
const COLLECTION_NAME = "newss"

function sanitizeCreateData(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { isPublished: false }
  }
  const { id, createdAt, updatedAt, isPublished, ...rest } = payload
  const keyAliases = {
    isVisible: "is_visible",
    iconType: "icon_type",
    isSystem: "is_system",
  }
  const normalizedRest = Object.fromEntries(
    Object.entries(rest).map(([key, value]) => [keyAliases[key] || key, value])
  )
  return {
    ...normalizedRest,
    isPublished: typeof isPublished === "boolean" ? isPublished : false,
  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?)?$/

function convertDatesForMongo(obj, forPipeline = false) {
  if (!obj || typeof obj !== "object") return obj
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string" && ISO_DATE_RE.test(value) && !isNaN(new Date(value).getTime())) {
      result[key] = forPipeline
        ? { $toDate: new Date(value).toISOString() }
        : { $date: new Date(value).toISOString() }
    } else {
      result[key] = value
    }
  }
  return result
}

function getModel() {
  return prisma[MODEL_KEY] || null
}

function asObjectIdFilter(id) {
  return { _id: { $oid: String(id) } }
}

function normalizeMongoDoc(doc) {
  if (!doc || typeof doc !== "object") return null
  const mapped = { ...doc }
  if (mapped._id && typeof mapped._id === "object" && mapped._id.$oid) {
    mapped.id = mapped._id.$oid
    delete mapped._id
  }
  return mapped
}

async function ensureMongoTimestamps() {
  await prisma.$runCommandRaw({
    update: COLLECTION_NAME,
    updates: [
      {
        q: { created_at: { $type: "string" } },
        u: [{ $set: { created_at: { $toDate: "$created_at" } } }],
        multi: true
      },
      {
        q: { updated_at: { $type: "string" } },
        u: [{ $set: { updated_at: { $toDate: "$updated_at" } } }],
        multi: true
      },
      {
        q: { created_at: { $exists: false } },
        u: [{ $set: { created_at: "$$NOW" } }],
        multi: true
      },
      {
        q: { updated_at: { $exists: false } },
        u: [{ $set: { updated_at: "$$NOW" } }],
        multi: true
      },
      {
        q: { data: { $type: "string" } },
        u: [{ $set: { data: { $toDate: "$data" } } }],
        multi: true
      }
    ]
  })
}

async function findManyViaMongo(skip, take) {
  return findManyViaMongoWithFilter(skip, take, {})
}

async function findManyViaMongoWithFilter(skip, take, filter) {
  await ensureMongoTimestamps()
  const [listResult, countResult] = await Promise.all([
    prisma.$runCommandRaw({
      find: COLLECTION_NAME,
      filter: filter || {},
      sort: { created_at: -1 },
      skip,
      limit: take
    }),
    prisma.$runCommandRaw({
      count: COLLECTION_NAME,
      query: filter || {}
    })
  ])

  const docs = (listResult?.cursor?.firstBatch || []).map(normalizeMongoDoc)
  const total = Number(countResult?.n || 0)
  return { docs, total }
}

async function findOneViaMongo(id) {
  const result = await prisma.$runCommandRaw({
    find: COLLECTION_NAME,
    filter: asObjectIdFilter(id),
    limit: 1
  })
  const doc = result?.cursor?.firstBatch?.[0]
  return normalizeMongoDoc(doc)
}

async function createViaMongo(payload) {
  const data = sanitizeCreateData(payload)

  await prisma.$runCommandRaw({
    insert: COLLECTION_NAME,
    documents: [{
      ...convertDatesForMongo(data)
    }]
  })
  await ensureMongoTimestamps()

  const result = await prisma.$runCommandRaw({
    find: COLLECTION_NAME,
    filter: {},
    sort: { created_at: -1 },
    limit: 1
  })
  return normalizeMongoDoc(result?.cursor?.firstBatch?.[0])
}

async function updateViaMongo(id, payload) {
  const sanitized = sanitizeCreateData(payload)
  const hasAdditionalBlocks = Object.prototype.hasOwnProperty.call(sanitized, "additionalBlocks")

  if (hasAdditionalBlocks) {
    await prisma.$runCommandRaw({
      update: COLLECTION_NAME,
      updates: [{
        q: asObjectIdFilter(id),
        u: { $unset: { additionalBlocks: "" } },
        multi: false
      }]
    })
  }

  await prisma.$runCommandRaw({
    update: COLLECTION_NAME,
    updates: [{
      q: asObjectIdFilter(id),
      u: [{
        $set: {
          ...convertDatesForMongo(sanitized, true),
          created_at: { $ifNull: ["$created_at", "$$NOW"] },
          updated_at: "$$NOW"
        }
      }],
      multi: false
    }]
  })
  return findOneViaMongo(id)
}

async function deleteViaMongo(id) {
  await prisma.$runCommandRaw({
    delete: COLLECTION_NAME,
    deletes: [{
      q: asObjectIdFilter(id),
      limit: 1
    }]
  })
}

// @desc    Get all news
// @route   GET /api/news
// @access  Private
export const getNewss = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query
  const skip = (parseInt(page) - 1) * parseInt(limit)
  const take = parseInt(limit)
  const model = getModel()

  await ensureMongoTimestamps()

  let items = []
  let total = 0

  if (model) {
    [items, total] = await Promise.all([
      model.findMany({
        skip,
        take,
        orderBy: {
          createdAt: "desc"
        }
      }),
      model.count()
    ])
  } else {
    const result = await findManyViaMongo(skip, take)
    items = result.docs
    total = result.total
  }

  res.json({
    news: items,
    total,
    page: parseInt(page),
    limit: take,
    totalPages: Math.ceil(total / take)
  })
})

// @desc    Get published news (public)
// @route   GET /api/news/public
// @access  Public
export const getPublicNewss = asyncHandler(async (req, res) => {
  const { page = 1, limit = 100 } = req.query
  const skip = (parseInt(page) - 1) * parseInt(limit)
  const take = parseInt(limit)
  const model = getModel()

  await ensureMongoTimestamps()

  let items = []
  let total = 0

  if (model) {
    [items, total] = await Promise.all([
      model.findMany({
        where: { isPublished: true },
        skip,
        take,
        orderBy: {
          createdAt: "desc"
        }
      }),
      model.count({ where: { isPublished: true } })
    ])
  } else {
    const result = await findManyViaMongoWithFilter(skip, take, { isPublished: true })
    items = result.docs
    total = result.total
  }

  res.json({
    news: items,
    total,
    page: parseInt(page),
    limit: take,
    totalPages: Math.ceil(total / take)
  })
})

// @desc    Get single news
// @route   GET /api/news/:id
// @access  Private
export const getNewsById = asyncHandler(async (req, res) => {
  await ensureMongoTimestamps()
  const model = getModel()
  const item = model
    ? await model.findUnique({ where: { id: req.params.id } })
    : await findOneViaMongo(req.params.id)

  if (!item) {
    res.status(404)
    throw new Error("News not found")
  }

  res.json(item)
})

// @desc    Create news
// @route   POST /api/news
// @access  Private
export const createNews = asyncHandler(async (req, res) => {
  const model = getModel()
  const item = model
    ? await model.create({ data: sanitizeCreateData(req.body) })
    : await createViaMongo(req.body)

  res.status(201).json(item)
})

// @desc    Update news
// @route   PUT /api/news/:id
// @access  Private
export const updateNews = asyncHandler(async (req, res) => {
  const model = getModel()
  const existing = model
    ? await model.findUnique({ where: { id: req.params.id } })
    : await findOneViaMongo(req.params.id)

  if (!existing) {
    res.status(404)
    throw new Error("News not found")
  }

  const hasAdditionalBlocks = Object.prototype.hasOwnProperty.call(req.body || {}, "additionalBlocks")

  const updatedNews = model
    ? (hasAdditionalBlocks
      ? await updateViaMongo(req.params.id, req.body)
      : await model.update({
        where: {
          id: req.params.id
        },
        data: sanitizeCreateData(req.body)
      }))
    : await updateViaMongo(req.params.id, req.body)

  res.json(updatedNews)
})

// @desc    Delete news
// @route   DELETE /api/news/:id
// @access  Private
export const deleteNews = asyncHandler(async (req, res) => {
  const model = getModel()
  const existing = model
    ? await model.findUnique({ where: { id: req.params.id } })
    : await findOneViaMongo(req.params.id)

  if (!existing) {
    res.status(404)
    throw new Error("News not found")
  }

  if (model) {
    await model.delete({ where: { id: req.params.id } })
  } else {
    await deleteViaMongo(req.params.id)
  }

  res.json({ message: "News deleted" })
})
