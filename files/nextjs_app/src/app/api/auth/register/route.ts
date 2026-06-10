import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const { name, email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'メールアドレスとパスワードは必須です' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'このメールアドレスは既に使用されています' }, { status: 409 })
  }

  const hashed = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: { name, email, password: hashed },
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
