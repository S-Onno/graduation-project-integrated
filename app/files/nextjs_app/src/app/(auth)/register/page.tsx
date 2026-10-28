'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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
      const data = await res.json()
      setError(data.error ?? '登録に失敗しました')
    } else {
      router.push('/login?registered=1')
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-box">
        <div className="auth-logo">
          <span className="auth-logo-icon">🦁</span>
          <span className="auth-logo-title">ZooTask</span>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
            新規アカウント登録
          </p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">ニックネーム</label>
            <input
              className="form-input"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例: 勇者ナオ"
            />
          </div>
          <div className="form-group">
            <label className="form-label">メールアドレス *</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="example@mail.com"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">パスワード *</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="6文字以上"
              minLength={6}
              required
            />
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '8px' }} disabled={loading}>
            {loading ? '登録中...' : 'アカウントを作成'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '14px', color: 'var(--text-secondary)' }}>
          すでにアカウントをお持ちの方は{' '}
          <Link href="/login" style={{ color: 'var(--accent-purple-light)' }}>ログイン</Link>
        </p>
      </div>
    </div>
  )
}
