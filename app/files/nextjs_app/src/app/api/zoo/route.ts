import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const placements = await prisma.zooPlacement.findMany({
    where: { userId: session.user.id },
    include: { userAnimal: { include: { animal: true } } },
  })
  return NextResponse.json(placements)
}
