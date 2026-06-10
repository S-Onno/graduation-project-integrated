import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tasks = await prisma.task.findMany({
    where: { userId: session.user.id },
    orderBy: { created_at: 'desc' },
  })
  return NextResponse.json(tasks)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, description } = await req.json()
  if (!title) return NextResponse.json({ error: 'タイトルは必須です' }, { status: 400 })

  const task = await prisma.task.create({
    data: { userId: session.user.id, title, description },
  })
  return NextResponse.json(task, { status: 201 })
}
