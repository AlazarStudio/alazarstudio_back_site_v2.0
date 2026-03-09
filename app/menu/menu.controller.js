import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"

function getModelClient(prismaClient, baseName) {
  const lower = baseName.toLowerCase()
  const singular = lower.endsWith('s') ? lower.slice(0, -1) : lower
  const candidates = [lower, singular, `${singular}Item`]
  for (const key of candidates) {
    if (prismaClient[key]) return prismaClient[key]
  }
  return null
}

function sanitizeCreateData(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { isPublished: false }
  }
  const {
    id,
    createdAt,
    updatedAt,
    isPublished,
    publicUrlTemplate,
    adminUi,
    publicLink,
    ...rest
  } = payload

  // Поля, которые не входят в схему Menu — переносим в additionalBlocks
  const extraForBlocks = {}
  if (publicUrlTemplate !== undefined) extraForBlocks.publicUrlTemplate = publicUrlTemplate
  if (adminUi !== undefined) extraForBlocks.adminUi = adminUi
  if (publicLink !== undefined) extraForBlocks.publicLink = publicLink

  const keyAliases = {
    isVisible: "is_visible",
    iconType: "icon_type",
    isSystem: "is_system",
  }
  const normalizedRest = Object.fromEntries(
    Object.entries(rest).map(([key, value]) => [keyAliases[key] || key, value])
  )

  // Допустимые поля модели Menu (prisma/schema.prisma)
  const allowedKeys = new Set([
    "label", "url", "order", "is_visible", "icon", "icon_type", "is_system",
    "additionalBlocks"
  ])
  const data = {}
  for (const [key, value] of Object.entries(normalizedRest)) {
    if (allowedKeys.has(key)) data[key] = value
  }

  const existingBlocks =
    data.additionalBlocks && typeof data.additionalBlocks === "object" && !Array.isArray(data.additionalBlocks)
      ? data.additionalBlocks
      : {}
  if (Object.keys(extraForBlocks).length > 0) {
    data.additionalBlocks = { ...existingBlocks, ...extraForBlocks }
  } else if (data.additionalBlocks === undefined) {
    data.additionalBlocks = existingBlocks
  }

  return {
    ...data,
    isPublished: typeof isPublished === "boolean" ? isPublished : false,
  }
}

const COLLECTION_NAME = "menus"

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
      }
    ]
  })
}

async function findManyViaMongo() {
  await ensureMongoTimestamps()
  const result = await prisma.$runCommandRaw({
    find: COLLECTION_NAME,
    filter: {},
    sort: { created_at: -1 }
  })
  return (result?.cursor?.firstBatch || []).map(normalizeMongoDoc)
}

async function findOneViaMongo(id) {
  const result = await prisma.$runCommandRaw({
    find: COLLECTION_NAME,
    filter: asObjectIdFilter(id),
    limit: 1
  })
  return normalizeMongoDoc(result?.cursor?.firstBatch?.[0])
}

async function createViaMongo(payload) {
  const data = sanitizeCreateData(payload)
  await prisma.$runCommandRaw({
    insert: COLLECTION_NAME,
    documents: [{
      ...data
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

async function replaceCollectionViaMongo(items) {
  await prisma.$runCommandRaw({
    delete: COLLECTION_NAME,
    deletes: [{ q: {}, limit: 0 }]
  })

  const docs = (items || []).map((item) => {
    return {
      ...sanitizeCreateData(item),
    }
  })

  if (docs.length > 0) {
    await prisma.$runCommandRaw({
      insert: COLLECTION_NAME,
      documents: docs
    })
  }

  await ensureMongoTimestamps()
  return findManyViaMongo()
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

// @desc    Get all menu (bulk collection)
// @route   GET /api/menu
// @access  Private/Public
export const getMenus = asyncHandler(async (req, res) => {
  const model = getModelClient(prisma, "menu")
  const items = model
    ? await model.findMany({
      orderBy: {
        createdAt: "desc"
      }
    })
    : await findManyViaMongo()

  res.json({ items })
})

// @desc    Get single menu
// @route   GET /api/menu/:id
// @access  Private
export const getMenuById = asyncHandler(async (req, res) => {
  const model = getModelClient(prisma, "menu")
  const item = model
    ? await model.findUnique({
      where: {
        id: req.params.id
      }
    })
    : await findOneViaMongo(req.params.id)

  if (!item) {
    res.status(404)
    throw new Error("Menu not found")
  }

  res.json(item)
})

// @desc    Create menu
// @route   POST /api/menu
// @access  Private
export const createMenu = asyncHandler(async (req, res) => {
  const model = getModelClient(prisma, "menu")
  const item = model
    ? await model.create({
      data: sanitizeCreateData(req.body)
    })
    : await createViaMongo(req.body)

  res.status(201).json(item)
})

// @desc    Replace menu collection
// @route   PUT /api/menu
// @access  Private
export const updateMenu = asyncHandler(async (req, res) => {
  const { items } = req.body

  if (!Array.isArray(items)) {
    res.status(400)
    throw new Error("items must be an array")
  }

  const model = getModelClient(prisma, "menu")
  const createdItems = model
    ? (await model.deleteMany({}), await Promise.all(
      items.map((item) =>
        model.create({
          data: sanitizeCreateData(item)
        })
      )
    ))
    : await replaceCollectionViaMongo(items)

  res.json({ items: createdItems })
})

// @desc    Delete menu
// @route   DELETE /api/menu/:id
// @access  Private
export const deleteMenu = asyncHandler(async (req, res) => {
  const model = getModelClient(prisma, "menu")
  const item = model
    ? await model.findUnique({
      where: {
        id: req.params.id
      }
    })
    : await findOneViaMongo(req.params.id)

  if (!item) {
    res.status(404)
    throw new Error("Menu not found")
  }

  if (model) {
    await model.delete({
      where: {
        id: req.params.id
      }
    })
  } else {
    await deleteViaMongo(req.params.id)
  }

  res.json({ message: "Menu deleted" })
})
