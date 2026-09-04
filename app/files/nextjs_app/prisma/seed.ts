import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const areas = [
    { name: 'ジャングル', area_type: 'JUNGLE' as const, order: 1 },
    { name: 'サバンナ',   area_type: 'SAVANNA' as const, order: 2 },
    { name: '雪',         area_type: 'SNOW' as const,    order: 3 },
    { name: '水',         area_type: 'WATER' as const,   order: 4 },
  ]

  for (const area of areas) {
    await prisma.area.upsert({
      where: { area_type: area.area_type },
      update: {},
      create: area,
    })
  }

  const animals = [
    { name: 'ゴリラ',     area_type: 'JUNGLE' as const },
    { name: 'オウム',     area_type: 'JUNGLE' as const },
    { name: 'サル',       area_type: 'JUNGLE' as const },
    { name: 'ライオン',   area_type: 'SAVANNA' as const },
    { name: 'ゾウ',       area_type: 'SAVANNA' as const },
    { name: 'キリン',     area_type: 'SAVANNA' as const },
    { name: 'シロクマ',   area_type: 'SNOW' as const },
    { name: 'ペンギン',   area_type: 'SNOW' as const },
    { name: 'アザラシ',   area_type: 'SNOW' as const },
    { name: 'カバ',       area_type: 'WATER' as const },
    { name: 'ワニ',       area_type: 'WATER' as const },
    { name: 'フラミンゴ', area_type: 'WATER' as const },
  ]

  for (const animal of animals) {
    const existing = await prisma.animal.findFirst({ where: { name: animal.name, area_type: animal.area_type } })
    if (!existing) {
      await prisma.animal.create({ data: animal })
    }
  }

  console.log('Seed complete: 4 areas, 12 animals')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
