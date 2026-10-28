import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const VALID_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW', 'NONE']

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

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 })
  }

  const { title, description, due_date, priority } = body
  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'タイトルは必須です' }, { status: 400 })
  }

  const trimmedTitle = title.trim()
  if (trimmedTitle.length === 0 || trimmedTitle.length > 200) {
    return NextResponse.json({ error: 'タイトルは1文字以上200文字以下で入力してください' }, { status: 400 })
  }

  const trimmedDesc = typeof description === 'string' ? description.trim() : null
  if (trimmedDesc && trimmedDesc.length > 2000) {
    return NextResponse.json({ error: '説明文は2000文字以下で入力してください' }, { status: 400 })
  }

  // due_dateが入力されている場合のみ日付として正しいかチェック
  let dueDate: Date | undefined = undefined
  if (due_date) {
    const parsed = typeof due_date === 'string' ? new Date(due_date) : new Date(NaN)
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: '期限日時の形式が正しくありません' }, { status: 400 })
    }
    dueDate = parsed
  }

  // priorityが未指定ならNONE、指定されていれば有効な値かチェック
  if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: '優先順位の値が正しくありません' }, { status: 400 })
  }

  const task = await prisma.task.create({
    data: {
      userId: session.user.id,
      title: trimmedTitle,
      description: trimmedDesc,
      due_date: dueDate,
      priority: priority ?? 'NONE',
    },
  })
  return NextResponse.json(task, { status: 201 })
}
