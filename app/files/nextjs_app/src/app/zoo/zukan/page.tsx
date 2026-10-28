'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/AppShell'

const ANIMAL_EMOJI: Record<string, string> = {
  ゴリラ: '🦍', オウム: '🦜', サル: '🐒',
  ライオン: '🦁', ゾウ: '🐘', キリン: '🦒',
  シロクマ: '🐻‍❄️', ペンギン: '🐧', アザラシ: '🦭',
  カバ: '🦛', ワニ: '🐊', フラミンゴ: '🦩',
}

interface Adult {
  id: string
  animal: { name: string; area_type: string; area: { name: string } }
  is_placed: boolean
}

export default function ZukanPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [adults, setAdults] = useState<Adult[]>([])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const fetchZukan = useCallback(async () => {
    const res = await fetch('/api/zukan')
    if (res.ok) setAdults(await res.json())
  }, [])

  useEffect(() => { if (session) fetchZukan() }, [session, fetchZukan])

  if (status === 'loading') return null

  return (
    <AppShell>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700 }}>📖 動物図鑑</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          育成完了した動物のコレクション ({adults.length} / 12)
        </p>
      </div>

      {adults.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '48px', marginBottom: '16px' }}>📖</p>
          <p>まだコレクションがありません。</p>
          <p style={{ fontSize: '13px', marginTop: '8px' }}>9タスク完了で1匹の動物が大人になります！</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
          {adults.map(a => (
            <div key={a.id} className="animal-card">
              <span className="animal-emoji" style={{ fontSize: '56px' }}>{ANIMAL_EMOJI[a.animal.name] ?? '🐾'}</span>
              <p className="animal-name">{a.animal.name}</p>
              <p className="animal-stage">{a.animal.area.name}</p>
              {a.is_placed && <p style={{ fontSize: '11px', color: 'var(--accent-green)', marginTop: '4px' }}>✓ 配置済み</p>}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  )
}
