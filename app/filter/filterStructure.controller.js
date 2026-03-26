import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"
import { syncResourceModelFromStructure } from "../utils/structure-model-sync.js"

const PRISMA_MODEL_KEY = "filterStructure"
const STRUCTURE_COLLECTION = "filter_structures"
const RESOURCE_NAME = "filter"

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
// @route   GET /api/filterStructure
// @access  Private
export const getFilterStructure = asyncHandler(async (req, res) => {
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
// @route   PUT /api/filterStructure
// @access  Private
export const updateFilterStructure = asyncHandler(async (req, res) => {
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
