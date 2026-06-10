import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AreaType } from '@/generated/prisma/client'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ areaType: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { areaType } = await params
  const area_type = areaType.toUpperCase() as AreaType

  const userArea = await prisma.userArea.upsert({
    where: { userId_area_type: { userId: session.user.id, area_type } },
    update: { is_unlocked: true, unlocked_at: new Date() },
    create: { userId: session.user.id, area_type, is_unlocked: true, unlocked_at: new Date() },
  })

  return NextResponse.json(userArea)
}
