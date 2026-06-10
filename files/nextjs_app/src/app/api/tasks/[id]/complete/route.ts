import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calcStage, acquireNewAnimal, checkAreaUnlock } from '@/lib/game'

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const userId = session.user.id

  const task = await prisma.task.findUnique({ where: { id } })
  if (!task || task.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (task.is_done) {
    return NextResponse.json({ error: 'すでに完了済みです' }, { status: 400 })
  }

  await prisma.task.update({
    where: { id },
    data: { is_done: true, done_at: new Date() },
  })

  // 育成中の動物（ADULT未満）の最古レコードを取得
  const currentAnimal = await prisma.userAnimal.findFirst({
    where: { userId, stage: { not: 'ADULT' } },
    orderBy: { acquired_at: 'asc' },
    include: { animal: true },
  })

  if (!currentAnimal) {
    await acquireNewAnimal(userId)
    const newAnimal = await prisma.userAnimal.findFirst({
      where: { userId, stage: 'BABY' },
      orderBy: { acquired_at: 'desc' },
      include: { animal: true },
    })
    return NextResponse.json({ task, animalUpdate: { type: 'acquired', animal: newAnimal } })
  }

  const newCount = currentAnimal.task_count + 1
  const newStage = calcStage(newCount)

  const updated = await prisma.userAnimal.update({
    where: { id: currentAnimal.id },
    data: { task_count: newCount, stage: newStage },
    include: { animal: true },
  })

  let areaUnlocked: string | null = null
  if (newStage === 'ADULT') {
    const before = await prisma.userArea.findMany({ where: { userId, is_unlocked: true } })
    await checkAreaUnlock(userId, currentAnimal.animalId)
    const after = await prisma.userArea.findMany({ where: { userId, is_unlocked: true } })
    if (after.length > before.length) {
      const newArea = after.find(a => !before.some(b => b.area_type === a.area_type))
      areaUnlocked = newArea?.area_type ?? null
    }
  }

  return NextResponse.json({
    task,
    animalUpdate: {
      type: newStage === currentAnimal.stage ? 'progress' : 'growUp',
      prevStage: currentAnimal.stage,
      newStage,
      animal: updated,
    },
    areaUnlocked,
  })
}
