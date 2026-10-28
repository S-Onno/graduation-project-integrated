import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

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

  const existing = await prisma.user.findUnique({ where: { email: trimmedEmail } })
  if (existing) {
    return NextResponse.json({ error: 'このメールアドレスは既に使用されています' }, { status: 409 })
  }

  const hashed = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: { name: trimmedName || trimmedEmail.split('@')[0], email: trimmedEmail, password: hashed },
  })

  // ジャングルエリアを解放
  const jungle = await prisma.area.findUnique({ where: { area_type: 'JUNGLE' } })
  if (jungle) {
    await prisma.userArea.create({
      data: { userId: user.id, area_type: 'JUNGLE', is_unlocked: true, unlocked_at: new Date() },
    })
  }

  return NextResponse.json({ id: user.id, email: user.email, name: user.name }, { status: 201 })
}
