import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { FIRST_AREA } from '@/lib/zooAreas'

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 })
  }

  const { name, email, password } = body

  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return NextResponse.json({ error: 'メールアドレスとパスワードは必須です' }, { status: 400 })
  }

  const trimmedEmail = email.trim().toLowerCase()
  const trimmedName = typeof name === 'string' ? name.trim().slice(0, 100) : ''

  if (!EMAIL_REGEX.test(trimmedEmail) || trimmedEmail.length > 255) {
    return NextResponse.json({ error: '有効なメールアドレス形式を入力してください' }, { status: 400 })
  }

  if (password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: 'パスワードは8文字以上128文字以下で設定してください' }, { status: 400 })
  }

  // 大文字と小文字を区別せずに確かめる(小文字にそろえる前に登録した、大文字を含むアカウントと重ならないように)
  const existing = await prisma.user.findFirst({
    where: { email: { equals: trimmedEmail, mode: 'insensitive' } },
  })
  if (existing) {
    return NextResponse.json({ error: 'このメールアドレスは既に使用されています' }, { status: 409 })
  }

  const hashed = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: { name: trimmedName || trimmedEmail.split('@')[0], email: trimmedEmail, password: hashed },
  })

  // 最初のエリア(サバンナ)を開園する
  const firstArea = await prisma.area.findUnique({ where: { area_type: FIRST_AREA } })
  if (firstArea) {
    await prisma.userArea.create({
      data: { userId: user.id, area_type: FIRST_AREA, is_unlocked: true, unlocked_at: new Date() },
    })
  }

  return NextResponse.json({ id: user.id, email: user.email, name: user.name }, { status: 201 })
}
