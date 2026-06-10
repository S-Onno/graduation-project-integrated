import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userAnimalId, area_type, pos_x, pos_y } = await req.json()

  const userAnimal = await prisma.userAnimal.findFirst({
    where: { id: userAnimalId, userId: session.user.id, stage: 'ADULT' },
  })
  if (!userAnimal) {
    return NextResponse.json({ error: '大人になった動物のみ配置できます' }, { status: 400 })
  }

  const placement = await prisma.zooPlacement.upsert({
    where: { userAnimalId },
    update: { area_type, pos_x, pos_y },
    create: { userId: session.user.id, userAnimalId, area_type, pos_x, pos_y },
  })

  await prisma.userAnimal.update({ where: { id: userAnimalId }, data: { is_placed: true } })

  return NextResponse.json(placement, { status: 201 })
}
