import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AnimalStage } from '@/generated/prisma/client'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { stage, task_count } = await req.json()

  const userAnimal = await prisma.userAnimal.findUnique({ where: { id } })
  if (!userAnimal) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.userAnimal.update({
    where: { id },
    data: {
      stage: stage as AnimalStage,
      task_count: task_count ?? userAnimal.task_count,
    },
    include: { animal: true },
  })

  await prisma.adminLog.create({
    data: {
      adminId: session.user.id,
      action: 'STAGE_CHANGE',
      target_id: id,
      detail: { before: { stage: userAnimal.stage }, after: { stage } },
    },
  })

  return NextResponse.json(updated)
}
