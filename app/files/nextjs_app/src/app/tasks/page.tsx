'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { TaskCard } from '@/components/task/TaskCard'
import { TaskForm } from '@/components/task/TaskForm'

interface Task {
  id: string
  title: string
  description?: string | null
  is_done: boolean
  created_at: string
}

interface AnimalUpdate {
  type: 'acquired' | 'progress' | 'growUp'
  prevStage?: string
  newStage?: string
  animal?: { animal: { name: string }; stage: string; task_count: number }
}

interface Toast {
  message: string
  emoji: string
}

export default function TasksPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>([])
  const [showForm, setShowForm] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const fetchTasks = useCallback(async () => {
    const res = await fetch('/api/tasks')
    if (res.ok) setTasks(await res.json())
  }, [])

  useEffect(() => { if (session) fetchTasks() }, [session, fetchTasks])

  const showToast = (message: string, emoji: string) => {
    setToast({ message, emoji })
    setTimeout(() => setToast(null), 3000)
  }

  const handleComplete = async (id: string) => {
    const res = await fetch(`/api/tasks/${id}/complete`, { method: 'PATCH' })
    if (!res.ok) return
    const data = await res.json()

    setTasks(prev => prev.map(t => t.id === id ? { ...t, is_done: true } : t))

    const update: AnimalUpdate = data.animalUpdate
    if (update?.type === 'acquired') {
      showToast(`🐣 ${update.animal?.animal.name ?? '動物'} の赤ちゃんを獲得しました！`, '🎉')
    } else if (update?.type === 'growUp') {
      const stageLabel: Record<string, string> = { CHILD: '子供', ADULT: '大人' }
      showToast(`✨ ${update.animal?.animal.name} が${stageLabel[update.newStage ?? ''] ?? ''}に成長！`, '🌟')
    } else {
      showToast('タスク完了！育成中の動物が成長しました 🐾', '✅')
    }

    if (data.areaUnlocked) {
      setTimeout(() => showToast(`🎊 新エリア「${data.areaUnlocked}」が解放されました！`, '🗺️'), 1500)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('このタスクを削除しますか？')) return
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    if (res.ok) setTasks(prev => prev.filter(t => t.id !== id))
  }

  const handleAdd = async (title: string, description: string) => {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description }),
    })
    if (res.ok) fetchTasks()
  }

  const pending = tasks.filter(t => !t.is_done)
  const done = tasks.filter(t => t.is_done)

  if (status === 'loading') return null

  return (
    <AppShell>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700 }}>タスク管理</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            タスクを完了すると動物が育ちます 🐾
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          ＋ 追加
        </button>
      </div>

      {/* 未完了タスク */}
      <div className="section-header" style={{ marginTop: '0' }}>
        <h3>📋 未完了 ({pending.length})</h3>
      </div>
      {pending.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          タスクはありません。右上の「＋ 追加」からタスクを作成してください。
        </div>
      ) : (
        pending.map(task => (
          <TaskCard key={task.id} task={task} onComplete={handleComplete} onDelete={handleDelete} />
        ))
      )}

      {/* 完了済みタスク */}
      {done.length > 0 && (
        <>
          <div className="section-header">
            <h3>✅ 完了済み ({done.length})</h3>
          </div>
          {done.map(task => (
            <TaskCard key={task.id} task={task} onComplete={handleComplete} onDelete={handleDelete} />
          ))}
        </>
      )}

      {showForm && <TaskForm onAdd={handleAdd} onClose={() => setShowForm(false)} />}

      {toast && (
        <div className="toast">
          {toast.emoji} {toast.message}
        </div>
      )}
    </AppShell>
  )
}
