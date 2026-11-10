'use client'

import { Suspense, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { PasswordInput } from '@/components/auth/PasswordInput'

// ログイン(壁紙と看板は (auth)/layout.tsx)
function LoginForm() {
  const router = useRouter()
  const registered = useSearchParams().get('registered') === '1' // 新規登録から来たとき
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)

    if (result?.error) {
      setError('メールアドレスまたはパスワードが正しくありません')
    } else {
      router.push('/tasks')
    }
  }

  return (
    <div className="za-card">
      <h1>ログイン</h1>

      {registered && !error && (
        <div className="za-alert success" role="status">
          登録が完了しました。ログインしてください。
        </div>
      )}
      {error && (
        <div className="za-alert error" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="za-group">
          <label className="za-label" htmlFor="login-email">
            メールアドレス
          </label>
          <input
            id="login-email"
            className="za-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@mail.com"
            autoComplete="email"
            required
          />
        </div>
        <div className="za-group">
          <label className="za-label" htmlFor="login-password">
            パスワード
          </label>
          <PasswordInput
            id="login-password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            placeholder="パスワード"
          />
        </div>
        <button type="submit" className="za-submit" disabled={loading}>
          {loading ? 'ログイン中...' : 'ログイン'}
        </button>
      </form>

      <p className="za-switch">
        はじめての方は <Link href="/register">新規登録</Link>
      </p>
    </div>
  )
}

// URL の ?registered=1 を読むので、Suspense で包む(Next.js のきまり)
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
