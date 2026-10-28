import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { pos_x, pos_y } = await req.json()

  const placement = await prisma.zooPlacement.findFirst({ where: { id, userId: session.user.id } })
  if (!placement) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.zooPlacement.update({ where: { id }, data: { pos_x, pos_y } })
  return NextResponse.json(updated)
}
