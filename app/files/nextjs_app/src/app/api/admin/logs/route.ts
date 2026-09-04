import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const logs = await prisma.adminLog.findMany({
    include: { admin: { select: { name: true, email: true } } },
    orderBy: { created_at: 'desc' },
    take: 100,
  })
  return NextResponse.json(logs)
}
