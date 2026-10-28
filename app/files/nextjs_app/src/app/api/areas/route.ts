import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const areas = await prisma.area.findMany({ orderBy: { order: 'asc' } })
  const userAreas = await prisma.userArea.findMany({ where: { userId: session.user.id } })

  const result = areas.map(area => ({
    ...area,
    is_unlocked: userAreas.find(ua => ua.area_type === area.area_type)?.is_unlocked ?? false,
    unlocked_at: userAreas.find(ua => ua.area_type === area.area_type)?.unlocked_at ?? null,
  }))

  return NextResponse.json(result)
}
