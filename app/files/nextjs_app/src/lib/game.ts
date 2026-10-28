import { AnimalStage, AreaType } from '@/generated/prisma/client'
import { prisma } from './prisma'

export function calcStage(taskCount: number): AnimalStage {
  if (taskCount >= 9) return 'ADULT'
  if (taskCount >= 4) return 'CHILD'
  return 'BABY'
}

const AREA_ORDER: AreaType[] = ['JUNGLE', 'SAVANNA', 'SNOW', 'WATER']

export async function acquireNewAnimal(userId: string): Promise<void> {
  const unlockedAreas = await prisma.userArea.findMany({
    where: { userId, is_unlocked: true },
    include: { area: true },
    orderBy: { area: { order: 'desc' } },
  })
  if (unlockedAreas.length === 0) return

  const latestArea = unlockedAreas[0].area_type
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

  if (adultCount < 3) return

  const currentIndex = AREA_ORDER.indexOf(animal.area_type)
  if (currentIndex === -1 || currentIndex >= AREA_ORDER.length - 1) return

  const nextArea = AREA_ORDER[currentIndex + 1]
  await prisma.userArea.upsert({
    where: { userId_area_type: { userId, area_type: nextArea } },
    update: { is_unlocked: true, unlocked_at: new Date() },
    create: { userId, area_type: nextArea, is_unlocked: true, unlocked_at: new Date() },
  })
}
