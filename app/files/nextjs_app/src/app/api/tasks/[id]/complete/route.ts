import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calcStage, acquireNewAnimal, checkAreaUnlock } from '@/lib/game'
import type { AreaType } from '@/lib/zooAreas'

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const userId = session.user.id

  const found = await prisma.task.findUnique({ where: { id } })
  if (!found || found.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // 完了と育成は、1つのトランザクションで行う。
  // 同じユーザーの完了が同時に届いても、1つずつ順番に処理する
  // (同時に動くと、赤ちゃんが2匹来る・同じ種類が重なる・育成の数がずれる、などが起きるため)
  const result = await prisma.$transaction(
    async (tx) => {
      // ユーザーごとのロック。トランザクションが終わると自動で外れる
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))::text AS locked`

      // まだ完了していないときだけ完了にする(同じタスクを2回完了しても、育成は1回だけ進む)
      const done = await tx.task.updateMany({
        where: { id, userId, is_done: false },
        data: { is_done: true, done_at: new Date() },
      })
      if (done.count === 0) return { alreadyDone: true as const }
      const task = await tx.task.findUnique({ where: { id } })

      // 育成中の動物(大人になっていない、いちばん古い1匹)
      const currentAnimal = await tx.userAnimal.findFirst({
        where: { userId, stage: { not: 'ADULT' } },
        orderBy: { acquired_at: 'asc' },
        include: { animal: true },
      })

      if (!currentAnimal) {
        const newAnimal = await acquireNewAnimal(tx, userId)
        return { task, animalUpdate: { type: 'acquired' as const, animal: newAnimal } }
      }

      const newCount = currentAnimal.task_count + 1
      const newStage = calcStage(newCount)

      const updated = await tx.userAnimal.update({
        where: { id: currentAnimal.id },
        data: { task_count: newCount, stage: newStage },
        include: { animal: true },
      })

      // 大人になったら、エリアの全種類がそろったか確かめる
      const areaUnlocked =
        newStage === 'ADULT' ? await checkAreaUnlock(tx, userId, currentAnimal.animal.area_type as AreaType) : null

      return {
        task,
        animalUpdate: {
          type: newStage === currentAnimal.stage ? ('progress' as const) : ('growUp' as const),
          prevStage: currentAnimal.stage,
          newStage,
          animal: updated,
        },
        areaUnlocked,
      }
    },
    { timeout: 10000 },
  )

  if ('alreadyDone' in result) {
    return NextResponse.json({ error: 'すでに完了済みです' }, { status: 400 })
  }
  return NextResponse.json(result)
}
