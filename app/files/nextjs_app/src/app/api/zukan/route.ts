import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adults = await prisma.userAnimal.findMany({
    where: { userId: session.user.id, stage: 'ADULT' },
    include: { animal: { include: { area: true } }, zooPlacement: true },
    orderBy: { updated_at: 'desc' },
  })
  return NextResponse.json(adults)
}
