'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PasswordInput } from '@/components/auth/PasswordInput'

// パスワードの長さ(サーバー側 /api/auth/register と同じ)
const PASSWORD_MIN = 8
const PASSWORD_MAX = 128

// 新規登録(壁紙と看板は (auth)/layout.tsx)
export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    })

    setLoading(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '登録に失敗しました')
    } else {
      router.push('/login?registered=1')
    }
  }

  return (
    <div className="za-card">
      <h1>新規登録</h1>

      {error && (
        <div className="za-alert error" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="za-group">
          <label className="za-label" htmlFor="register-name">
            ニックネーム<small>任意</small>
          </label>
          <input
            id="register-name"
            className="za-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 飼育員ナオ"
            autoComplete="nickname"
            maxLength={100}
          />
        </div>
        <div className="za-group">
          <label className="za-label" htmlFor="register-email">
            メールアドレス
          </label>
          <input
            id="register-email"
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
          <label className="za-label" htmlFor="register-password">
            パスワード
          </label>
          <PasswordInput
            id="register-password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder={`${PASSWORD_MIN}文字以上`}
            minLength={PASSWORD_MIN}
            maxLength={PASSWORD_MAX}
            describedBy="register-password-hint"
          />
          <p id="register-password-hint" className="za-hint">
            {PASSWORD_MIN}〜{PASSWORD_MAX}文字で決めてください
          </p>
        </div>
        <button type="submit" className="za-submit" disabled={loading}>
          {loading ? '登録中...' : 'アカウントを作る'}
        </button>
      </form>

      <p className="za-switch">
        アカウントをお持ちの方は <Link href="/login">ログイン</Link>
      </p>
    </div>
  )
}
