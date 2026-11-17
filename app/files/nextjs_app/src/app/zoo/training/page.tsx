'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/AppShell'

const STAGE_LABEL: Record<string, string> = { BABY: '赤ちゃん 🐣', CHILD: '子供 🐥', ADULT: '大人 🦁' }
const STAGE_MAX: Record<string, number> = { BABY: 4, CHILD: 9, ADULT: 9 }

const ANIMAL_EMOJI: Record<string, string> = {
  ゴリラ: '🦍', オウム: '🦜', サル: '🐒',
  ライオン: '🦁', ゾウ: '🐘', キリン: '🦒',
  シロクマ: '🐻‍❄️', ペンギン: '🐧', アザラシ: '🦭',
  カバ: '🦛', ワニ: '🐊', フラミンゴ: '🦩',
}

interface UserAnimal {
  id: string
  stage: string
  task_count: number
  is_placed: boolean
  animal: { name: string; area_type: string; area: { name: string } }
}

export default function IkuseiPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [animals, setAnimals] = useState<UserAnimal[]>([])
  const [placingId, setPlacingId] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const fetchAnimals = useCallback(async () => {
    const res = await fetch('/api/user-animals')
    if (res.ok) setAnimals(await res.json())
  }, [])

  useEffect(() => { if (session) fetchAnimals() }, [session, fetchAnimals])

  const handlePlace = async (userAnimalId: string, area_type: string) => {
    const res = await fetch('/api/zoo/place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userAnimalId, area_type, pos_x: 100 + Math.random() * 200, pos_y: 100 + Math.random() * 200 }),
    })
    if (res.ok) {
      setToast('🦁 動物園に配置しました！')
      setTimeout(() => setToast(''), 3000)
      fetchAnimals()
    }
    setPlacingId(null)
  }

  if (status === 'loading') return null

  const growing = animals.filter(a => a.stage !== 'ADULT')
  const adults = animals.filter(a => a.stage === 'ADULT')

  return (
    <AppShell>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px' }}>🐣 育成中の動物</h2>

      {growing.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', marginBottom: '20px' }}>
          育成中の動物はいません。タスクを完了すると赤ちゃん動物が現れます！
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {growing.map(a => {
            const progress = (a.task_count / STAGE_MAX[a.stage]) * 100
            return (
              <div key={a.id} className="animal-card">
                <span className="animal-emoji">{ANIMAL_EMOJI[a.animal.name] ?? '🐾'}</span>
                <p className="animal-name">{a.animal.name}</p>
                <p className="animal-stage">{STAGE_LABEL[a.stage]} — {a.animal.area.name}</p>
                <div className="stage-bar"><div className="stage-fill" style={{ width: `${Math.min(progress, 100)}%` }} /></div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  {a.task_count} / {STAGE_MAX[a.stage]} タスク
                </p>
              </div>
            )
          })}
        </div>
      )}

      <div className="section-header">
        <h3>🦁 大人になった動物（{adults.length}匹）</h3>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
        {adults.map(a => (
          <div key={a.id} className="animal-card">
            <span className="animal-emoji">{ANIMAL_EMOJI[a.animal.name] ?? '🐾'}</span>
            <p className="animal-name">{a.animal.name}</p>
            <p className="animal-stage">大人 🦁 — {a.animal.area.name}</p>
            {a.is_placed ? (
              <p style={{ fontSize: '12px', color: 'var(--accent-green)', marginTop: '8px' }}>✓ 配置済み</p>
            ) : (
              <button
                className="btn-primary"
                style={{ marginTop: '12px', width: '100%', fontSize: '13px' }}
                onClick={() => {
                  setPlacingId(a.id)
                  handlePlace(a.id, a.animal.area_type)
                }}
                disabled={placingId === a.id}
              >
                {placingId === a.id ? '配置中...' : '動物園に配置'}
              </button>
            )}
          </div>
        ))}
        {adults.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
            まだ大人になった動物はいません
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </AppShell>
  )
}
