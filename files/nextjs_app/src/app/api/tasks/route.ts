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

  const { title, description, due_date, priority } = await req.json()
  if (!title) return NextResponse.json({ error: 'タイトルは必須です' }, { status: 400 })

  // due_dateが入力されている場合のみ日付として正しいかチェック
  let dueDate: Date | undefined = undefined
if (due_date) {
    const parsed = new Date(due_date)
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
    data: { userId: session.user.id, title, description, due_date: dueDate, priority: priority ?? 'NONE' },
  })
  return NextResponse.json(task, { status: 201 })
}
