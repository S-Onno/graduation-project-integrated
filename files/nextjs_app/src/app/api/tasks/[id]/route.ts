import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const VALID_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW', 'NONE']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { title, description, due_date, priority } = await req.json()

  const task = await prisma.task.findUnique({ where: { id } })
  if (!task || task.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // due_dateのバリデーション
  let dueDate: Date | null | undefined = undefined
  if (due_date !== undefined) {
    if (due_date === null || due_date === '') {
      dueDate = null
    } else {
      const parsed = new Date(due_date)
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: '期限日時の形式が正しくありません' }, { status: 400 })
      }
      dueDate = parsed
    }
  }

  // priorityのバリデーション（未指定なら変更しない）
  if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: '優先順位の値が正しくありません' }, { status: 400 })
  }

  const updated = await prisma.task.update({
    where: { id },
    data: {
      title,
      description,
      ...(dueDate !== undefined ? { due_date: dueDate } : {}),
      ...(priority !== undefined ? { priority } : {}),
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const task = await prisma.task.findUnique({ where: { id } })
  if (!task || task.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.task.delete({ where: { id } })
  return NextResponse.json({ success: true })
}