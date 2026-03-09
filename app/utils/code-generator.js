import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Генерирует модель Prisma на основе метаданных
 */
export function generatePrismaModel(resourceName, fields) {
  const modelName = capitalizeFirst(resourceName)
  
  // Преобразуем поля в формат Prisma
  // Поле isPublished всегда добавляется как системное (Boolean @default(false)),
  // поэтому одноименные пользовательские поля отбрасываем, чтобы избежать конфликтов.
  const prismaFields = fields
    .filter(field => camelToSnake(field.name) !== 'is_published')
    .map(field => {
    const fieldName = camelToSnake(field.name)
    let prismaField = `  ${fieldName}`
    
    // Определяем тип
    switch (field.type) {
      case 'String':
        prismaField += ' String'
        break
      case 'Int':
        prismaField += ' Int'
        break
      case 'Float':
        prismaField += ' Float'
        break
      case 'Boolean':
        prismaField += ' Boolean'
        break
      case 'DateTime':
        prismaField += ' DateTime'
        break
      case 'Json':
        prismaField += ' Json'
        break
      default:
        prismaField += ' String'
    }
    
    // Добавляем опциональность
    if (!field.required) {
      prismaField += '?'
    }
    
      return prismaField
    })
  
  // Стандартные поля
  const standardFields = [
    '  id        String   @id @default(auto()) @map("_id") @db.ObjectId',
    '  createdAt DateTime @default(now()) @map("created_at")',
    '  updatedAt DateTime @updatedAt @map("updated_at")',
    '  isPublished Boolean @default(false)'
  ]
  
  // Автоматически добавляем поле additionalBlocks для дополнительных блоков
  const additionalBlocksField = '  additionalBlocks Json?'
  
  const allFields = [...standardFields, ...prismaFields, additionalBlocksField]
  
  const model = `model ${modelName} {
${allFields.join('\n')}
  
  @@map("${resourceName.toLowerCase()}s")
}`
  
  return model
}

/**
 * Генерирует модель структуры для ресурса (например, CasesStructure)
 */
export function generateStructureModel(resourceName) {
  const modelName = capitalizeFirst(resourceName) + 'Structure'
  const tableName = resourceName.toLowerCase() + '_structures'
  
  const model = `model ${modelName} {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  fields    Json?
  
  @@map("${tableName}")
}`
  
  return model
}

/**
 * Определяет, является ли ресурс singleton (один документ с JSON полем)
 */
function isSingletonResource(resourceName, fields, resourceType) {
  // Если явно указан тип ресурса
  if (resourceType === 'singleton') return true
  if (resourceType === 'collectionBulk') return false
  if (resourceType === 'collection') return false
  
  // Автоматическое определение: если есть только одно поле типа Json
  const jsonFields = fields.filter(f => f.type === 'Json')
  return jsonFields.length === 1 && fields.length === 1
}

/**
 * Генерирует контроллер для ресурса
 */
export function generateController(resourceName, fields = [], resourceType = null) {
  const modelName = capitalizeFirst(resourceName)
  const routeName = resourceName.toLowerCase()
  const isSingleton = isSingletonResource(resourceName, fields, resourceType)
  const isBulkCollection = resourceType === 'collectionBulk'

  // Для Menu — расширенная sanitize: publicUrlTemplate/adminUi/publicLink в additionalBlocks, только допустимые поля Prisma
  const sanitizeCreateDataBulk = resourceName === 'Menu' ? `function sanitizeCreateData(payload) {
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
}` : `function sanitizeCreateData(payload) {
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
}`

  if (isBulkCollection) {
    return `import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"

function getModelClient(prismaClient, baseName) {
  const lower = baseName.toLowerCase()
  const singular = lower.endsWith('s') ? lower.slice(0, -1) : lower
  const candidates = [lower, singular, \`\${singular}Item\`]
  for (const key of candidates) {
    if (prismaClient[key]) return prismaClient[key]
  }
  return null
}

${sanitizeCreateDataBulk}

const COLLECTION_NAME = "${routeName}s"

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

// @desc    Get all ${routeName} (bulk collection)
// @route   GET /api/${routeName}
// @access  Private/Public
export const get${modelName}s = asyncHandler(async (req, res) => {
  const model = getModelClient(prisma, "${routeName}")
  const items = model
    ? await model.findMany({
      orderBy: {
        createdAt: "desc"
      }
    })
    : await findManyViaMongo()

  res.json({ items })
})

// @desc    Get single ${routeName}
// @route   GET /api/${routeName}/:id
// @access  Private
export const get${modelName}ById = asyncHandler(async (req, res) => {
  const model = getModelClient(prisma, "${routeName}")
  const item = model
    ? await model.findUnique({
      where: {
        id: req.params.id
      }
    })
    : await findOneViaMongo(req.params.id)

  if (!item) {
    res.status(404)
    throw new Error("${modelName} not found")
  }

  res.json(item)
})

// @desc    Create ${routeName}
// @route   POST /api/${routeName}
// @access  Private
export const create${modelName} = asyncHandler(async (req, res) => {
  const model = getModelClient(prisma, "${routeName}")
  const item = model
    ? await model.create({
      data: sanitizeCreateData(req.body)
    })
    : await createViaMongo(req.body)

  res.status(201).json(item)
})

// @desc    Replace ${routeName} collection
// @route   PUT /api/${routeName}
// @access  Private
export const update${modelName} = asyncHandler(async (req, res) => {
  const { items } = req.body

  if (!Array.isArray(items)) {
    res.status(400)
    throw new Error("items must be an array")
  }

  const model = getModelClient(prisma, "${routeName}")
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

// @desc    Delete ${routeName}
// @route   DELETE /api/${routeName}/:id
// @access  Private
export const delete${modelName} = asyncHandler(async (req, res) => {
  const model = getModelClient(prisma, "${routeName}")
  const item = model
    ? await model.findUnique({
      where: {
        id: req.params.id
      }
    })
    : await findOneViaMongo(req.params.id)

  if (!item) {
    res.status(404)
    throw new Error("${modelName} not found")
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

  res.json({ message: "${modelName} deleted" })
})
`
  }
  
  // Если это singleton ресурс (один документ с JSON полем)
  if (isSingleton) {
    const jsonField = fields.find(f => f.type === 'Json')
    const fieldName = jsonField?.name || 'data'
    const varName = routeName.toLowerCase()
    
    return `import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"

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

// @desc    Get ${routeName} ${fieldName}
// @route   GET /api/${routeName}
// @access  Private
export const get${modelName}s = asyncHandler(async (req, res) => {
  // Ищем единственный документ ${modelName} или создаем его, если не существует
  let ${varName} = await prisma.${varName}.findFirst()
  
  if (!${varName}) {
    // Создаем новый документ ${modelName} с пустым значением для ${fieldName}
    ${varName} = await prisma.${varName}.create({
      data: {
        ${fieldName}: []
      }
    })
  }

  // Возвращаем значение ${fieldName} из единственного документа ${modelName}
  res.json({ ${fieldName}: ${varName}.${fieldName} || [] })
})

// @desc    Get single ${routeName}
// @route   GET /api/${routeName}/:id
// @access  Private
export const get${modelName}ById = asyncHandler(async (req, res) => {
  const ${varName} = await prisma.${varName}.findUnique({
    where: {
      id: req.params.id
    }
  })

  if (!${varName}) {
    res.status(404)
    throw new Error("${modelName} not found")
  }

  res.json(${varName})
})

// @desc    Create ${routeName}
// @route   POST /api/${routeName}
// @access  Private
export const create${modelName} = asyncHandler(async (req, res) => {
  const ${varName} = await prisma.${varName}.create({
    data: sanitizeCreateData(req.body)
  })

  res.status(201).json(${varName})
})

// @desc    Update ${routeName} ${fieldName}
// @route   PUT /api/${routeName}
// @access  Private
export const update${modelName} = asyncHandler(async (req, res) => {
  const { ${fieldName} } = req.body

  if (!Array.isArray(${fieldName})) {
    res.status(400)
    throw new Error("${fieldName} must be an array")
  }

  // Ищем единственный документ ${modelName} или создаем его, если не существует
  let ${varName} = await prisma.${varName}.findFirst()

  if (!${varName}) {
    // Создаем новый документ ${modelName} с переданными ${fieldName}
    ${varName} = await prisma.${varName}.create({
      data: {
        ${fieldName}: ${fieldName}
      }
    })
  } else {
    // Обновляем поле ${fieldName} существующего документа
    ${varName} = await prisma.${varName}.update({
      where: {
        id: ${varName}.id
      },
      data: {
        ${fieldName}: ${fieldName}
      }
    })
  }

  res.json({ ${fieldName}: ${varName}.${fieldName} || [] })
})

// @desc    Delete ${routeName}
// @route   DELETE /api/${routeName}/:id
// @access  Private
export const delete${modelName} = asyncHandler(async (req, res) => {
  const ${varName} = await prisma.${varName}.findUnique({
    where: {
      id: req.params.id
    }
  })

  if (!${varName}) {
    res.status(404)
    throw new Error("${modelName} not found")
  }

  await prisma.${varName}.delete({
    where: {
      id: req.params.id
    }
  })

  res.json({ message: "${modelName} deleted" })
})
`
  }
  
  // Стандартная логика для остальных ресурсов
  return `import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"

const MODEL_KEY = "${routeName.toLowerCase()}"
const COLLECTION_NAME = "${routeName.toLowerCase()}s"

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
      }
    ]
  })
}

async function findManyViaMongo(skip, take) {
  await ensureMongoTimestamps()
  const [listResult, countResult] = await Promise.all([
    prisma.$runCommandRaw({
      find: COLLECTION_NAME,
      filter: {},
      sort: { created_at: -1 },
      skip,
      limit: take
    }),
    prisma.$runCommandRaw({
      count: COLLECTION_NAME,
      query: {}
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
          ...sanitized,
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

// @desc    Get all ${routeName}
// @route   GET /api/${routeName}
// @access  Private
export const get${modelName}s = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query
  const skip = (parseInt(page) - 1) * parseInt(limit)
  const take = parseInt(limit)
  const model = getModel()

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
    ${routeName}: items,
    total,
    page: parseInt(page),
    limit: take,
    totalPages: Math.ceil(total / take)
  })
})

// @desc    Get single ${routeName}
// @route   GET /api/${routeName}/:id
// @access  Private
export const get${modelName}ById = asyncHandler(async (req, res) => {
  const model = getModel()
  const item = model
    ? await model.findUnique({ where: { id: req.params.id } })
    : await findOneViaMongo(req.params.id)

  if (!item) {
    res.status(404)
    throw new Error("${modelName} not found")
  }

  res.json(item)
})

// @desc    Create ${routeName}
// @route   POST /api/${routeName}
// @access  Private
export const create${modelName} = asyncHandler(async (req, res) => {
  const model = getModel()
  const item = model
    ? await model.create({ data: sanitizeCreateData(req.body) })
    : await createViaMongo(req.body)

  res.status(201).json(item)
})

// @desc    Update ${routeName}
// @route   PUT /api/${routeName}/:id
// @access  Private
export const update${modelName} = asyncHandler(async (req, res) => {
  const model = getModel()
  const existing = model
    ? await model.findUnique({ where: { id: req.params.id } })
    : await findOneViaMongo(req.params.id)

  if (!existing) {
    res.status(404)
    throw new Error("${modelName} not found")
  }

  const hasAdditionalBlocks = Object.prototype.hasOwnProperty.call(req.body || {}, "additionalBlocks")

  const updated${modelName} = model
    ? (hasAdditionalBlocks
      ? await updateViaMongo(req.params.id, req.body)
      : await model.update({
        where: {
          id: req.params.id
        },
        data: sanitizeCreateData(req.body)
      }))
    : await updateViaMongo(req.params.id, req.body)

  res.json(updated${modelName})
})

// @desc    Delete ${routeName}
// @route   DELETE /api/${routeName}/:id
// @access  Private
export const delete${modelName} = asyncHandler(async (req, res) => {
  const model = getModel()
  const existing = model
    ? await model.findUnique({ where: { id: req.params.id } })
    : await findOneViaMongo(req.params.id)

  if (!existing) {
    res.status(404)
    throw new Error("${modelName} not found")
  }

  if (model) {
    await model.delete({ where: { id: req.params.id } })
  } else {
    await deleteViaMongo(req.params.id)
  }

  res.json({ message: "${modelName} deleted" })
})
`
}

/**
 * Генерирует контроллер для структуры ресурса (singleton)
 */
export function generateStructureController(resourceName) {
  const modelName = capitalizeFirst(resourceName) + 'Structure'
  const routeName = resourceName.toLowerCase() + 'Structure'
  const prismaModelName = resourceName.toLowerCase() + 'Structure'
  const collectionName = resourceName.toLowerCase() + '_structures'
  
  return `import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"
import { syncResourceModelFromStructure } from "../utils/structure-model-sync.js"

const PRISMA_MODEL_KEY = "${prismaModelName}"
const STRUCTURE_COLLECTION = "${collectionName}"
const RESOURCE_NAME = "${resourceName.toLowerCase()}"

function getStructureModel() {
  return prisma[PRISMA_MODEL_KEY] || null
}

async function normalizeStructureDatesViaMongo() {
  await prisma.$runCommandRaw({
    update: STRUCTURE_COLLECTION,
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
      }
    ]
  })
}

async function getStructureViaMongo() {
  await prisma.$runCommandRaw({
    update: STRUCTURE_COLLECTION,
    updates: [
      {
        q: {},
        u: [
          {
            $set: {
              fields: { $ifNull: ["$fields", []] },
              created_at: { $ifNull: ["$created_at", "$$NOW"] },
              updated_at: "$$NOW"
            }
          }
        ],
        upsert: true,
        multi: false
      }
    ]
  })

  const result = await prisma.$runCommandRaw({
    find: STRUCTURE_COLLECTION,
    filter: {},
    limit: 1
  })

  const doc = result?.cursor?.firstBatch?.[0]
  return { fields: Array.isArray(doc?.fields) ? doc.fields : [] }
}

async function updateStructureViaMongo(fields) {
  await prisma.$runCommandRaw({
    update: STRUCTURE_COLLECTION,
    updates: [
      {
        q: {},
        u: [
          {
            $set: {
              fields: fields || [],
              created_at: { $ifNull: ["$created_at", "$$NOW"] },
              updated_at: "$$NOW"
            }
          }
        ],
        upsert: true,
        multi: false
      }
    ]
  })

  return { fields: fields || [] }
}

// @desc    Get structure
// @route   GET /api/${routeName}
// @access  Private
export const get${modelName} = asyncHandler(async (req, res) => {
  await normalizeStructureDatesViaMongo()

  const model = getStructureModel()
  if (!model) {
    const structure = await getStructureViaMongo()
    return res.json({ fields: structure.fields || [] })
  }

  try {
    // Ищем единственный документ или создаем его, если не существует
    let structure = await model.findFirst()
    
    if (!structure) {
      // Создаем новый документ с пустым значением для fields
      structure = await model.create({
        data: {
          fields: []
        }
      })
    }

    // Возвращаем значение fields из единственного документа
    return res.json({ fields: structure.fields || [] })
  } catch (error) {
    const structure = await getStructureViaMongo()
    return res.json({ fields: structure.fields || [] })
  }
})

// @desc    Update structure
// @route   PUT /api/${routeName}
// @access  Private
export const update${modelName} = asyncHandler(async (req, res) => {
  const { fields } = req.body

  if (!Array.isArray(fields)) {
    res.status(400)
    throw new Error("fields must be an array")
  }

  await normalizeStructureDatesViaMongo()

  const model = getStructureModel()
  if (!model) {
    const structure = await updateStructureViaMongo(fields)
    const syncInfo = await syncResourceModelFromStructure(RESOURCE_NAME, structure.fields || [])
    return res.json({ fields: structure.fields || [], modelSynced: syncInfo.changed })
  }

  try {
    // Ищем единственный документ или создаем его
    let structure = await model.findFirst()
    
    if (!structure) {
      structure = await model.create({
        data: {
          fields: fields || []
        }
      })
    } else {
      // Обновляем существующий документ
      structure = await model.update({
        where: {
          id: structure.id
        },
        data: {
          fields: fields || []
        }
      })
    }

    const syncInfo = await syncResourceModelFromStructure(RESOURCE_NAME, structure.fields || [])
    return res.json({ fields: structure.fields || [], modelSynced: syncInfo.changed })
  } catch (error) {
    const structure = await updateStructureViaMongo(fields)
    const syncInfo = await syncResourceModelFromStructure(RESOURCE_NAME, structure.fields || [])
    return res.json({ fields: structure.fields || [], modelSynced: syncInfo.changed })
  }
})
`
}

/**
 * Генерирует роуты для структуры ресурса (singleton)
 */
export function generateStructureRoutes(resourceName) {
  const modelName = capitalizeFirst(resourceName) + 'Structure'
  const routeName = resourceName.toLowerCase() + 'Structure'
  
  return `import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  get${modelName},
  update${modelName}
} from "./${resourceName.toLowerCase()}Structure.controller.js"

const router = express.Router()

router
  .route("/")
  .get(protect, get${modelName})
  .put(protect, update${modelName})

export default router
`
}

/**
 * Генерирует роуты для ресурса
 */
export function generateRoutes(resourceName, fields = [], resourceType = null) {
  const modelName = capitalizeFirst(resourceName)
  const routeName = resourceName.toLowerCase()
  const isSingleton = isSingletonResource(resourceName, fields, resourceType)
  const isBulkCollection = resourceType === 'collectionBulk'
  
  if (isBulkCollection) {
    return `import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  get${modelName}s,
  get${modelName}ById,
  create${modelName},
  update${modelName},
  delete${modelName}
} from "./${routeName}.controller.js"

const router = express.Router()

router
  .route("/")
  .get(get${modelName}s)
  .put(protect, update${modelName})
  .post(protect, create${modelName})

router
  .route("/:id")
  .get(protect, get${modelName}ById)
  .delete(protect, delete${modelName})

export default router
`
  }
  
  // Если это singleton ресурс, PUT должен быть на корневом роуте
  if (isSingleton) {
    return `import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  get${modelName}s,
  get${modelName}ById,
  create${modelName},
  update${modelName},
  delete${modelName}
} from "./${routeName}.controller.js"

const router = express.Router()

router
  .route("/")
  .get(protect, get${modelName}s)
  .put(protect, update${modelName}) // PUT /api/${routeName} для обновления singleton ресурса
  .post(protect, create${modelName})

router
  .route("/:id")
  .get(protect, get${modelName}ById)
  .delete(protect, delete${modelName})

export default router
`
  }
  
  // Стандартная логика для коллекций (обычных ресурсов)
  return `import express from "express"
import { protect } from "../middleware/auth.middleware.js"
import {
  get${modelName}s,
  get${modelName}ById,
  create${modelName},
  update${modelName},
  delete${modelName}
} from "./${routeName}.controller.js"

const router = express.Router()

router
  .route("/")
  .get(protect, get${modelName}s)
  .post(protect, create${modelName})

router
  .route("/:id")
  .get(protect, get${modelName}ById)
  .put(protect, update${modelName})
  .delete(protect, delete${modelName})

export default router
`
}

/**
 * Добавляет модель в schema.prisma
 */
/**
 * Извлекает поля модели из схемы Prisma
 */
function extractModelFields(schemaContent, modelName) {
  // Ищем модель с учетом вложенных скобок
  const modelStartRegex = new RegExp(`model\\s+${modelName}\\s*\\{`, 'm')
  const startMatch = schemaContent.match(modelStartRegex)
  if (!startMatch) return null
  
  const startIndex = startMatch.index + startMatch[0].length
  let braceCount = 1
  let endIndex = startIndex
  
  // Находим закрывающую скобку модели
  for (let i = startIndex; i < schemaContent.length && braceCount > 0; i++) {
    if (schemaContent[i] === '{') braceCount++
    if (schemaContent[i] === '}') braceCount--
    if (braceCount === 0) {
      endIndex = i
      break
    }
  }
  
  const modelBody = schemaContent.substring(startIndex, endIndex)
  const fields = []
  const lines = modelBody.split('\n')
  
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('@@')) continue
    
    // Пропускаем стандартные поля (id, createdAt, updatedAt)
    if (trimmed.includes('@id') || trimmed.includes('@default') || 
        trimmed.includes('createdAt') || trimmed.includes('updatedAt') ||
        trimmed.match(/^\s*(id|createdAt|updatedAt)\s+/)) {
      continue
    }
    
    // Извлекаем имя поля и тип (учитываем опциональность)
    const fieldMatch = trimmed.match(/^\s*(\w+)\s+(\w+)\??/)
    if (fieldMatch) {
      fields.push({
        name: fieldMatch[1],
        type: fieldMatch[2],
        required: !trimmed.includes('?')
      })
    }
  }
  
  return fields
}

/**
 * Сравнивает два массива полей
 */
function compareFields(oldFields, newFields) {
  if (!oldFields || oldFields.length !== newFields.length) return false
  
  const oldMap = new Map(oldFields.map(f => [f.name, f]))
  const newMap = new Map(newFields.map(f => [f.name, f]))
  
  // Проверяем что все поля совпадают
  for (const [name, newField] of newMap) {
    const oldField = oldMap.get(name)
    if (!oldField || oldField.type !== newField.type || oldField.required !== newField.required) {
      return false
    }
  }
  
  return true
}

function ensurePrismaSchemaPreamble(schemaContent) {
  const hasGenerator = /(^|\n)\s*generator\s+client\s*\{/m.test(schemaContent)
  const hasDatasource = /(^|\n)\s*datasource\s+db\s*\{/m.test(schemaContent)

  if (hasGenerator && hasDatasource) return schemaContent

  const preamble = `generator client {
  provider = "prisma-client-js"
  output   = "../generated/client"
}

datasource db {
  provider = "mongodb"
  url      = env("DATABASE_URL")
}
`

  const trimmed = schemaContent.trimStart()
  if (!trimmed) return `${preamble}\n`
  return `${preamble}\n${trimmed}`
}

export async function addModelToSchema(model) {
  const schemaPath = path.join(__dirname, '../../prisma/schema.prisma')
  let schemaContent = await fs.readFile(schemaPath, 'utf-8')
  schemaContent = ensurePrismaSchemaPreamble(schemaContent)
  
  const modelName = model.match(/model\s+(\w+)/)?.[1]
  if (!modelName) {
    throw new Error('Не удалось определить имя модели')
  }
  
  console.log(`🔍 Проверяю наличие модели: ${modelName}`)
  
  // Проверяем наличие модели
  const modelRegex = new RegExp(`model\\s+${modelName}\\s*\\{`, 'm')
  const modelExists = modelRegex.test(schemaContent)
  
  if (modelExists) {
    console.log(`📝 Модель ${modelName} уже существует, проверяю изменения...`)
    
    // Извлекаем поля из новой модели (с учетом вложенных скобок)
    const newModelStartRegex = /model\s+\w+\s*\{/m
    const newStartMatch = model.match(newModelStartRegex)
    if (!newStartMatch) {
      throw new Error('Не удалось распарсить новую модель')
    }
    
    const newStartIndex = newStartMatch.index + newStartMatch[0].length
    let newBraceCount = 1
    let newEndIndex = newStartIndex
    
    // Находим закрывающую скобку модели
    for (let i = newStartIndex; i < model.length && newBraceCount > 0; i++) {
      if (model[i] === '{') newBraceCount++
      if (model[i] === '}') newBraceCount--
      if (newBraceCount === 0) {
        newEndIndex = i
        break
      }
    }
    
    const newModelBody = model.substring(newStartIndex, newEndIndex)
    const newModelLines = newModelBody.split('\n')
    const newFields = []
    
    for (const line of newModelLines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('@@')) continue
      
      // Пропускаем стандартные поля
      if (trimmed.includes('@id') || trimmed.includes('@default') || 
          trimmed.includes('createdAt') || trimmed.includes('updatedAt') ||
          trimmed.match(/^\s*(id|createdAt|updatedAt)\s+/)) {
        continue
      }
      
      // Извлекаем имя поля и тип
      const fieldMatch = trimmed.match(/^\s*(\w+)\s+(\w+)\??/)
      if (fieldMatch) {
        newFields.push({
          name: fieldMatch[1],
          type: fieldMatch[2],
          required: !trimmed.includes('?')
        })
      }
    }
    
    // Извлекаем поля из существующей модели
    const oldFields = extractModelFields(schemaContent, modelName)
    
    // Сравниваем поля
    const fieldsAreSame = compareFields(oldFields, newFields)
    
    if (fieldsAreSame) {
      console.log(`✅ Модель ${modelName} не изменилась, пропускаю обновление`)
      return false // Модель не изменилась, ничего не делаем
    }
    
    console.log(`🔄 Модель ${modelName} изменилась, обновляю...`)
    
    // Заменяем существующую модель на новую (с учетом вложенных скобок)
    const modelStartRegex = new RegExp(`model\\s+${modelName}\\s*\\{`, 'm')
    const startMatch = schemaContent.match(modelStartRegex)
    if (startMatch) {
      const startIndex = startMatch.index
      let braceCount = 1
      let endIndex = startMatch.index + startMatch[0].length
      
      // Находим закрывающую скобку модели
      for (let i = endIndex; i < schemaContent.length && braceCount > 0; i++) {
        if (schemaContent[i] === '{') braceCount++
        if (schemaContent[i] === '}') braceCount--
        if (braceCount === 0) {
          endIndex = i + 1
          break
        }
      }
      
      // Заменяем модель
      const before = schemaContent.substring(0, startIndex)
      const after = schemaContent.substring(endIndex)
      schemaContent = before + model + '\n' + after
    } else {
      // Если не нашли, просто добавляем в конец
      schemaContent = schemaContent.trim() + '\n\n' + model + '\n'
    }
    
    await fs.writeFile(schemaPath, schemaContent, 'utf-8')
    console.log(`✅ Модель ${modelName} успешно обновлена`)
    return true
  } else {
    console.log(`✅ Модель ${modelName} не найдена, добавляю в схему...`)
    
    // Добавляем модель в конец файла
    const newSchema = schemaContent.trim() + '\n\n' + model + '\n'
    
    await fs.writeFile(schemaPath, newSchema, 'utf-8')
    console.log(`✅ Модель ${modelName} успешно добавлена в схему`)
    return true
  }
}

/**
 * Создает или обновляет файл контроллера
 */
export async function createControllerFile(resourceName, content) {
  const controllerDir = path.join(__dirname, `../${resourceName.toLowerCase()}`)
  await fs.mkdir(controllerDir, { recursive: true })
  
  const controllerPath = path.join(controllerDir, `${resourceName.toLowerCase()}.controller.js`)
  
  try {
    await fs.access(controllerPath)
    console.log(`🔄 Контроллер для ${resourceName} уже существует, обновляю...`)
  } catch {
    console.log(`📝 Создаю контроллер для ${resourceName}...`)
  }
  
  await fs.writeFile(controllerPath, content, 'utf-8')
}

/**
 * Создает или обновляет файл роутов
 */
export async function createRoutesFile(resourceName, content) {
  const routesDir = path.join(__dirname, `../${resourceName.toLowerCase()}`)
  await fs.mkdir(routesDir, { recursive: true })
  
  const routesPath = path.join(routesDir, `${resourceName.toLowerCase()}.routes.js`)
  
  try {
    await fs.access(routesPath)
    console.log(`🔄 Роуты для ${resourceName} уже существуют, обновляю...`)
  } catch {
    console.log(`📝 Создаю роуты для ${resourceName}...`)
  }
  
  await fs.writeFile(routesPath, content, 'utf-8')
}

/**
 * Регистрирует роуты в server.js (если еще не зарегистрированы)
 */
export async function registerRoutesInServer(resourceName) {
  const serverPath = path.join(__dirname, '../../server.js')
  let serverContent = await fs.readFile(serverPath, 'utf-8')
  
  const routeName = resourceName.toLowerCase()
  const importName = `${routeName}Routes`
  const importPath = `./app/${routeName}/${routeName}.routes.js`
  
  // Проверяем, не зарегистрированы ли уже роуты
  const importExists = serverContent.includes(`import ${importName}`)
  const routeExists = serverContent.includes(`"/api/${routeName}"`)
  
  if (importExists && routeExists) {
    console.log(`✅ Роуты для ${resourceName} уже зарегистрированы, пропускаю...`)
    return // Роуты уже зарегистрированы, ничего не делаем
  }
  
  // Добавляем импорт если его нет
  if (!importExists) {
    console.log(`📝 Добавляю импорт для ${resourceName}...`)
    const importLines = serverContent.split('\n')
    let lastImportIndex = -1
    for (let i = importLines.length - 1; i >= 0; i--) {
      if (importLines[i].includes('Routes') && importLines[i].includes('from')) {
        lastImportIndex = i
        break
      }
    }
    
    if (lastImportIndex === -1) {
      throw new Error('Could not find place to add import')
    }
    
    importLines.splice(lastImportIndex + 1, 0, `import ${importName} from "${importPath}"`)
    serverContent = importLines.join('\n')
  }
  
  // Добавляем регистрацию роута если её нет
  if (!routeExists) {
    console.log(`📝 Регистрирую роуты для ${resourceName}...`)
    const lines = serverContent.split('\n')
    let lastUseIndex = -1
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes('app.use("/api/') && lines[i].includes('Routes')) {
        lastUseIndex = i
        break
      }
    }
    
    if (lastUseIndex === -1) {
      throw new Error('Could not find place to register routes')
    }
    
    lines.splice(lastUseIndex + 1, 0, `  app.use("/api/${routeName}", ${importName})`)
    serverContent = lines.join('\n')
  }
  
  await fs.writeFile(serverPath, serverContent, 'utf-8')
}

/**
 * Выполняет prisma generate и db push
 */
export async function syncPrisma() {
  const projectRoot = path.join(__dirname, '../..')
  
  // Проверяем, что schema.prisma существует
  const schemaPath = path.join(projectRoot, 'prisma', 'schema.prisma')
  try {
    await fs.access(schemaPath)
    console.log('✅ Schema.prisma найден:', schemaPath)
  } catch (e) {
    throw new Error(`Schema.prisma не найден по пути: ${schemaPath}`)
  }
  
  try {
    console.log('🔄 Синхронизирую схему с БД и обновляю Prisma Client...')
    console.log('📁 Рабочая директория:', projectRoot)
    
    // Сначала выполняем db push (синхронизация схемы с БД)
    const pushOutput = execSync('npx prisma db push --accept-data-loss --skip-generate', { 
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    })
    
    if (pushOutput) {
      const outputStr = pushOutput.toString()
      if (outputStr.trim()) {
        console.log('Prisma db push output:', outputStr)
      }
    }
    
    console.log('✅ Схема синхронизирована с БД')
    
    // Затем пытаемся обновить Prisma Client
    // Это может не сработать если файлы заблокированы, но попробуем
    try {
      console.log('🔄 Обновляю Prisma Client...')
      const generateOutput = execSync('npx prisma generate', { 
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024
      })
      
      if (generateOutput) {
        const outputStr = generateOutput.toString()
        if (outputStr.trim()) {
          console.log('Prisma generate output:', outputStr)
        }
      }
      console.log('✅ Prisma Client обновлен')
    } catch (generateError) {
      // Если не удалось обновить (файлы заблокированы), принудительно перезапускаем сервер
      console.log('⚠️ Не удалось обновить Prisma Client (файлы заблокированы):', generateError.message)
      console.log('🔄 Принудительно перезапускаю сервер через изменение server.js...')
      
      // Пытаемся принудительно перезапустить сервер, изменив server.js
      try {
        const serverPath = path.join(projectRoot, 'server.js')
        let serverContent = await fs.readFile(serverPath, 'utf-8')
        // Добавляем/обновляем комментарий с timestamp, чтобы nodemon перезапустился
        const timestamp = Date.now()
        const comment = `// Prisma Client updated at ${timestamp}`
        
        // Удаляем старый комментарий если есть
        serverContent = serverContent.replace(/\/\/ Prisma Client updated at \d+\n/g, '')
        
        // Добавляем новый комментарий в конец файла
        if (!serverContent.endsWith('\n')) {
          serverContent += '\n'
        }
        serverContent += comment + '\n'
        
        await fs.writeFile(serverPath, serverContent, 'utf-8')
        console.log('✅ Изменен server.js для перезапуска nodemon')
        console.log('ℹ️ Сервер перезапустится через несколько секунд, Prisma Client будет обновлен')
      } catch (serverError) {
        console.log('⚠️ Не удалось изменить server.js для перезапуска:', serverError.message)
        console.log('ℹ️ Пожалуйста, перезапустите сервер вручную для обновления Prisma Client')
      }
    }
  } catch (error) {
    console.error('❌ Ошибка синхронизации Prisma:', error.message)
    
    // Выводим stdout если есть
    if (error.stdout) {
      console.error('Prisma stdout:', error.stdout.toString())
    }
    
    // Выводим stderr если есть
    if (error.stderr) {
      console.error('Prisma stderr:', error.stderr.toString())
    }
    
    // Выводим полный объект ошибки для отладки
    console.error('Полная ошибка Prisma:', {
      message: error.message,
      code: error.code,
      signal: error.signal,
      status: error.status,
      stdout: error.stdout?.toString(),
      stderr: error.stderr?.toString()
    })
    
    // Создаем более информативную ошибку
    const errorMessage = error.stderr 
      ? `Prisma error: ${error.stderr.toString()}` 
      : `Prisma error: ${error.message}`
    
    throw new Error(errorMessage)
  }
}

/**
 * Вспомогательные функции
 */
function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

function camelToSnake(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
    .replace(/^_/, '')
}

/**
 * Валидация имени ресурса
 */
export function validateResourceName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Resource name is required')
  }
  
  // Проверяем, что имя содержит только буквы, цифры и подчеркивания
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error('Resource name must start with a letter and contain only letters, numbers, and underscores')
  }
  
  // Проверяем зарезервированные слова
  const reserved = ['user', 'auth', 'config', 'admin', 'api', 'public']
  if (reserved.includes(name.toLowerCase())) {
    throw new Error(`Resource name "${name}" is reserved`)
  }
  
  return true
}
