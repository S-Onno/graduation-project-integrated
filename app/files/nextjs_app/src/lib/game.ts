import { AnimalStage } from '@/generated/prisma/client'
import { prisma } from './prisma'
import { ADULTS_TO_UNLOCK, AREA_ORDER } from './zooAreas'

export function calcStage(taskCount: number): AnimalStage {
  if (taskCount >= 9) return 'ADULT'
  if (taskCount >= 4) return 'CHILD'
  return 'BABY'
}

export async function acquireNewAnimal(userId: string): Promise<void> {
  const unlockedAreas = await prisma.userArea.findMany({
    where: { userId, is_unlocked: true },
  })
  if (unlockedAreas.length === 0) return

  // 開園しているエリアのうち、開園する順番(AREA_ORDER)がいちばん後のエリアから動物が来る
  const unlockedTypes = new Set<string>(unlockedAreas.map((a) => a.area_type))
  const latestArea = [...AREA_ORDER].reverse().find((type) => unlockedTypes.has(type))
  if (!latestArea) return
  const animals = await prisma.animal.findMany({ where: { area_type: latestArea } })
  if (animals.length === 0) return

  const animal = animals[Math.floor(Math.random() * animals.length)]
  await prisma.userAnimal.create({
    data: { userId, animalId: animal.id, stage: 'BABY', task_count: 1 },
  })
}

export async function checkAreaUnlock(userId: string, animalId: string): Promise<void> {
  const animal = await prisma.animal.findUnique({ where: { id: animalId } })
  if (!animal) return

  const adultCount = await prisma.userAnimal.count({
    where: {
      userId,
      stage: 'ADULT',
      animal: { area_type: animal.area_type },
    },
  })

  if (adultCount < ADULTS_TO_UNLOCK) return

  const currentIndex = AREA_ORDER.indexOf(animal.area_type)
  if (currentIndex === -1 || currentIndex >= AREA_ORDER.length - 1) return

  const nextArea = AREA_ORDER[currentIndex + 1]
  await prisma.userArea.upsert({
    where: { userId_area_type: { userId, area_type: nextArea } },
    update: { is_unlocked: true, unlocked_at: new Date() },
    create: { userId, area_type: nextArea, is_unlocked: true, unlocked_at: new Date() },
  })
}
