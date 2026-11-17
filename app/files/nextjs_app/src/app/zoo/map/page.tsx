'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/AppShell'

interface Area {
  id: string
  name: string
  area_type: string
  order: number
  is_unlocked: boolean
}

const AREA_EMOJI: Record<string, string> = { JUNGLE: '🌿', SAVANNA: '🌵', SNOW: '❄️', WATER: '🌊' }
const AREA_COLOR: Record<string, string> = {
  JUNGLE: '#1a3a1a', SAVANNA: '#3a2a0a', SNOW: '#1a2a3a', WATER: '#0a1a3a',
}
const UNLOCK_REQ: Record<string, string> = {
  JUNGLE: '初期解放済み',
  SAVANNA: 'ジャングルで大人3匹育成',
  SNOW: 'サバンナで大人3匹育成',
  WATER: '雪で大人3匹育成',
}

export default function MapPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [areas, setAreas] = useState<Area[]>([])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const fetchAreas = useCallback(async () => {
    const res = await fetch('/api/areas')
    if (res.ok) setAreas(await res.json())
  }, [])

  useEffect(() => { if (session) fetchAreas() }, [session, fetchAreas])

  if (status === 'loading') return null

  return (
    <AppShell>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700 }}>🗺️ エリアマップ</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          タスクをこなして新しいエリアを解放しよう！
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
        {areas.map(area => (
          <div
            key={area.id}
            className="card"
            style={{
              background: area.is_unlocked ? AREA_COLOR[area.area_type] : 'var(--bg-card)',
              borderColor: area.is_unlocked ? 'var(--border-light)' : 'var(--border)',
              opacity: area.is_unlocked ? 1 : 0.6,
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: '48px', marginBottom: '8px' }}>
              {area.is_unlocked ? AREA_EMOJI[area.area_type] : '🔒'}
            </p>
            <p style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>{area.name}</p>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {area.is_unlocked
                ? '✓ 解放済み'
                : UNLOCK_REQ[area.area_type]}
            </p>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: '20px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          💡 各エリアで大人3匹を育成すると次のエリアが解放されます。全36タスクでフルコンプリート！
        </p>
      </div>
    </AppShell>
  )
}
