import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AreaType } from '@/generated/prisma/client'

const VALID_AREAS: AreaType[] = ['JUNGLE', 'SAVANNA', 'SNOW', 'WATER']

export async function POST(_req: NextRequest, { params }: { params: Promise<{ areaType: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { areaType } = await params
  if (!areaType || typeof areaType !== 'string') {
    return NextResponse.json({ error: 'エリア種別が指定されていません' }, { status: 400 })
  }

  const normalizedArea = areaType.toUpperCase() as AreaType
  if (!VALID_AREAS.includes(normalizedArea)) {
    return NextResponse.json({ error: '無効なエリア種別です' }, { status: 400 })
  }

  const userArea = await prisma.userArea.upsert({
    where: { userId_area_type: { userId: session.user.id, area_type: normalizedArea } },
    update: { is_unlocked: true, unlocked_at: new Date() },
    create: { userId: session.user.id, area_type: normalizedArea, is_unlocked: true, unlocked_at: new Date() },
  })

  return NextResponse.json(userArea)
}
