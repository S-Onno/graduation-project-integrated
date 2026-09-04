import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AreaType } from '@/generated/prisma/client'

const VALID_AREAS: AreaType[] = ['JUNGLE', 'SAVANNA', 'SNOW', 'WATER']

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 })
  }

  const { userAnimalId, area_type, pos_x, pos_y } = body

  if (!userAnimalId || typeof userAnimalId !== 'string') {
    return NextResponse.json({ error: '動物IDは必須です' }, { status: 400 })
  }

  const normalizedArea = typeof area_type === 'string' ? (area_type.toUpperCase() as AreaType) : null
  if (!normalizedArea || !VALID_AREAS.includes(normalizedArea)) {
    return NextResponse.json({ error: '無効なエリア種別です' }, { status: 400 })
  }

  if (
    typeof pos_x !== 'number' ||
    typeof pos_y !== 'number' ||
    !Number.isFinite(pos_x) ||
    !Number.isFinite(pos_y) ||
    pos_x < 0 ||
    pos_x > 100 ||
    pos_y < 0 ||
    pos_y > 100
  ) {
    return NextResponse.json({ error: '配置座標は0から100の範囲内の有効な数値で指定してください' }, { status: 400 })
  }

  const userAnimal = await prisma.userAnimal.findFirst({
    where: { id: userAnimalId, userId: session.user.id, stage: 'ADULT' },
  })
  if (!userAnimal) {
    return NextResponse.json({ error: '大人になった動物のみ配置できます' }, { status: 400 })
  }

  const placement = await prisma.zooPlacement.upsert({
    where: { userAnimalId },
    update: { area_type: normalizedArea, pos_x, pos_y },
    create: { userId: session.user.id, userAnimalId, area_type: normalizedArea, pos_x, pos_y },
  })

  await prisma.userAnimal.update({ where: { id: userAnimalId }, data: { is_placed: true } })

  return NextResponse.json(placement, { status: 201 })
}
