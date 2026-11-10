import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email:    { label: 'メールアドレス', type: 'email' },
        password: { label: 'パスワード',     type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        // 登録ではメールアドレスを小文字にそろえて保存しているので、ログインでも小文字にそろえて探す。
        // 小文字にそろえる前(2026/9/4 より前)に登録したアカウントは大文字のまま残っていることがあるので、
        // 見つからなければ、大文字と小文字を区別せずに探す
        const email = credentials.email.trim()
        const user =
          (await prisma.user.findUnique({ where: { email: email.toLowerCase() } })) ??
          (await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } }))
        if (!user || !user.password) return null

        const valid = await bcrypt.compare(credentials.password, user.password)
        if (!valid) return null

        return { id: user.id, email: user.email, name: user.name, is_admin: user.is_admin }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.is_admin = (user as { is_admin?: boolean }).is_admin ?? false
        return token
      }
      // ログイン中の確認のたびに、ユーザーが今も DB にいるかを確かめる。
      // DB を作り直した・ユーザーを消したあとに、ブラウザの古いログインが残らないようにするため。
      // ここでエラーにすると、NextAuth は Cookie を消して「ログインしていない」として扱う
      const current = await prisma.user.findUnique({
        where: { id: token.id as string },
        select: { is_admin: true },
      })
      if (!current) throw new Error('ユーザーが見つからないため、ログインを取り消します')
      token.is_admin = current.is_admin // 管理者の権限を変えたら、すぐに反映する
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.is_admin = token.is_admin as boolean
      }
      return session
    },
  },
}
