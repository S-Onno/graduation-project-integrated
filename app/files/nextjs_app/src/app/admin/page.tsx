'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/AppShell'

interface User { id: string; name?: string | null; email: string; is_admin: boolean }
interface Log { id: string; action: string; target_id: string; created_at: string; admin: { name?: string | null; email: string } }
interface UserAnimal { id: string; stage: string; task_count: number; animal: { name: string } }

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [userAnimals, setUserAnimals] = useState<UserAnimal[]>([])
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    if (status === 'authenticated' && !session?.user.is_admin) router.push('/tasks')
  }, [status, session, router])

  const fetchData = useCallback(async () => {
    const [uRes, lRes] = await Promise.all([fetch('/api/admin/users'), fetch('/api/admin/logs')])
    if (uRes.ok) setUsers(await uRes.json())
    if (lRes.ok) setLogs(await lRes.json())
  }, [])

  useEffect(() => { if (session?.user.is_admin) fetchData() }, [session, fetchData])

  const fetchUserAnimals = async (userId: string) => {
    setSelectedUserId(userId)
    const res = await fetch(`/api/user-animals`)
    if (res.ok) setUserAnimals(await res.json())
  }

  const forceStage = async (userAnimalId: string, stage: string) => {
    const taskMap: Record<string, number> = { BABY: 1, CHILD: 4, ADULT: 9 }
    await fetch(`/api/admin/animals/${userAnimalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, task_count: taskMap[stage] }),
    })
    setToast(`ステージを ${stage} に変更しました`)
    setTimeout(() => setToast(''), 3000)
    fetchUserAnimals(selectedUserId)
    fetchData()
  }

  const forceUnlockArea = async (userId: string, area_type: string) => {
    await fetch('/api/admin/areas/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, area_type }),
    })
    setToast(`${area_type} エリアを強制解放しました`)
    setTimeout(() => setToast(''), 3000)
    fetchData()
  }

  if (status === 'loading' || !session?.user.is_admin) return null

  return (
    <AppShell>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700 }}>🔧 管理者パネル</h2>
        <p style={{ fontSize: '13px', color: 'var(--accent-red)', marginTop: '4px' }}>デモ発表用 — 動物ステージ・エリアを手動操作できます</p>
      </div>

      {/* ユーザー一覧 */}
      <div className="section-header" style={{ marginTop: 0 }}>
        <h3>👥 ユーザー一覧 ({users.length})</h3>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
        {users.map(user => (
          <div key={user.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
            <div>
              <p style={{ fontWeight: 600 }}>{user.name ?? '名前なし'}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{user.email} {user.is_admin && '⚙️ 管理者'}</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button className="btn-ghost" style={{ fontSize: '12px' }} onClick={() => fetchUserAnimals(user.id)}>
                動物を確認
              </button>
              {(['SAVANNA', 'SNOW', 'WATER'] as const).map(area => (
                <button key={area} className="btn-danger" style={{ fontSize: '12px' }} onClick={() => forceUnlockArea(user.id, area)}>
                  {area} 解放
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 選択ユーザーの動物 */}
      {selectedUserId && userAnimals.length > 0 && (
        <>
          <div className="section-header">
            <h3>🐾 動物ステージ操作</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
            {userAnimals.map(ua => (
              <div key={ua.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
                <div>
                  <p style={{ fontWeight: 600 }}>{ua.animal.name}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>現在: {ua.stage} ({ua.task_count} タスク)</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['BABY', 'CHILD', 'ADULT'] as const).map(stage => (
                    <button key={stage} className={stage === ua.stage ? 'btn-primary' : 'btn-ghost'} style={{ fontSize: '12px' }}
                      onClick={() => forceStage(ua.id, stage)} disabled={stage === ua.stage}>
                      {stage}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ログ */}
      <div className="section-header">
        <h3>📋 操作ログ (最新100件)</h3>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {logs.slice(0, 20).map(log => (
          <div key={log.id} style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)' }}>
            [{new Date(log.created_at).toLocaleString('ja-JP')}] {log.admin.name ?? log.admin.email} — {log.action} → {log.target_id}
          </div>
        ))}
        {logs.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>ログなし</p>}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </AppShell>
  )
}
