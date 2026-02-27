import { prisma } from "../app/prisma.js";

const COLLECTION = "casess";

async function countStringTyped(field) {
  const result = await prisma.$runCommandRaw({
    aggregate: COLLECTION,
    pipeline: [
      { $match: { [field]: { $type: "string" } } },
      { $count: "count" },
    ],
    cursor: {},
  });
  return Number(result?.cursor?.firstBatch?.[0]?.count || 0);
}

async function main() {
  const beforeTsena = await countStringTyped("tsena");
  const beforeProsmotry = await countStringTyped("prosmotry");

  console.log(`[before] tsena strings: ${beforeTsena}`);
  console.log(`[before] prosmotry strings: ${beforeProsmotry}`);

  await prisma.$runCommandRaw({
    update: COLLECTION,
    updates: [
      {
        q: { tsena: { $exists: true } },
        u: [
          {
            $set: {
              tsena: {
                $convert: {
                  input: "$tsena",
                  to: "int",
                  onError: null,
                  onNull: null,
                },
              },
            },
          },
        ],
        multi: true,
      },
      {
        q: { prosmotry: { $exists: true } },
        u: [
          {
            $set: {
              prosmotry: {
                $convert: {
                  input: "$prosmotry",
                  to: "int",
                  onError: null,
                  onNull: null,
                },
              },
            },
          },
        ],
        multi: true,
      },
    ],
  });

  const afterTsena = await countStringTyped("tsena");
  const afterProsmotry = await countStringTyped("prosmotry");

  console.log(`[after] tsena strings: ${afterTsena}`);
  console.log(`[after] prosmotry strings: ${afterProsmotry}`);
}

main()
  .catch((error) => {
    console.error("Failed to normalize Cases numeric fields:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
