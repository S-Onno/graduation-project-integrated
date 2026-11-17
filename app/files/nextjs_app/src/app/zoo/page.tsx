'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { ZooCanvas } from '@/components/zoo/ZooCanvas'

interface Placement {
  id: string
  pos_x: number
  pos_y: number
  area_type: string
  userAnimal: { animal: { name: string } }
}

export default function ZooPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [placements, setPlacements] = useState<Placement[]>([])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const fetchPlacements = useCallback(async () => {
    const res = await fetch('/api/zoo')
    if (res.ok) setPlacements(await res.json())
  }, [])

  useEffect(() => { if (session) fetchPlacements() }, [session, fetchPlacements])

  const handleMove = async (id: string, x: number, y: number) => {
    await fetch(`/api/zoo/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pos_x: x, pos_y: y }),
    })
  }

  if (status === 'loading') return null

  return (
    <AppShell>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700 }}>🦁 動物園</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          大人になった動物を配置して動物園を育てましょう
        </p>
      </div>

      {placements.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '48px', marginBottom: '16px' }}>🏞️</p>
          <p>まだ動物が配置されていません。</p>
          <p style={{ fontSize: '13px', marginTop: '8px' }}>タスクを9回完了すると動物が大人になって配置できます。</p>
        </div>
      ) : (
        <ZooCanvas placements={placements} onPlacementMove={handleMove} />
      )}

      <div className="card" style={{ marginTop: '20px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          💡 動物はドラッグで移動できます。大人になった動物は「育成中」ページから配置してください。
        </p>
      </div>
    </AppShell>
  )
}
