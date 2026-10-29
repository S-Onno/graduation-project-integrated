import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const VALID_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW', 'NONE'] as const
type Priority = (typeof VALID_PRIORITIES)[number]

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 })
  }

  const { title, description, due_date, priority } = body

  const task = await prisma.task.findUnique({ where: { id } })
  if (!task || task.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updateData: {
    title?: string
    description?: string | null
    due_date?: Date | null
    priority?: Priority
  } = {}

  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0 || title.trim().length > 200) {
      return NextResponse.json({ error: 'タイトルは1文字以上200文字以下で入力してください' }, { status: 400 })
    }
    updateData.title = title.trim()
  }

  if (description !== undefined) {
    if (description !== null && typeof description !== 'string') {
      return NextResponse.json({ error: '説明文の形式が不正です' }, { status: 400 })
    }
    if (typeof description === 'string' && description.trim().length > 2000) {
      return NextResponse.json({ error: '説明文は2000文字以下で入力してください' }, { status: 400 })
    }
    updateData.description = typeof description === 'string' ? description.trim() : null
  }

  // due_dateのバリデーション（null または空文字なら期限を解除）
  if (due_date !== undefined) {
    if (due_date === null || due_date === '') {
      updateData.due_date = null
    } else {
      const parsed = typeof due_date === 'string' ? new Date(due_date) : new Date(NaN)
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: '期限日時の形式が正しくありません' }, { status: 400 })
      }
      updateData.due_date = parsed
    }
  }

  // priorityのバリデーション（未指定なら変更しない）
  if (priority !== undefined) {
    if (!VALID_PRIORITIES.includes(priority)) {
      return NextResponse.json({ error: '優先順位の値が正しくありません' }, { status: 400 })
    }
    updateData.priority = priority
  }

  const updated = await prisma.task.update({
    where: { id },
    data: updateData,
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
