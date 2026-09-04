import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AreaType } from '@/generated/prisma/client'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, area_type } = await req.json()

  const userArea = await prisma.userArea.upsert({
    where: { userId_area_type: { userId, area_type: area_type as AreaType } },
    update: { is_unlocked: true, unlocked_at: new Date() },
    create: { userId, area_type: area_type as AreaType, is_unlocked: true, unlocked_at: new Date() },
  })

  await prisma.adminLog.create({
    data: {
      adminId: session.user.id,
      action: 'AREA_UNLOCK',
      target_id: userId,
      detail: { area_type },
    },
  })

  return NextResponse.json(userArea)
}
