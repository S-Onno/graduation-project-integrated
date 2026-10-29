'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { TaskCard } from '@/components/task/TaskCard'
import { TaskForm } from '@/components/task/TaskForm'
import { IkuseiView, IkuseiHandle } from '@/app/zoo/training/page'

type PriorityValue = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'

interface Task {
  id: string
  title: string
  description?: string | null
  due_date?: string | null   // 追加
  priority: PriorityValue    // 追加
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
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [pendingOpen, setPendingOpen] = useState(true)
  const [doneOpen, setDoneOpen] = useState(true)

  const ikuseiRef = useRef<IkuseiHandle>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const fetchTasks = useCallback(async () => {
    const res = await fetch('/api/tasks')
    if (res.ok) setTasks(await res.json())
  }, [])

  useEffect(() => {
    if (session) {
      fetchTasks()
    }
  }, [session, fetchTasks])

  const showToast = (message: string, emoji: string) => {
    setToast({ message, emoji })
    setTimeout(() => setToast(null), 3000)
  }

  const handleComplete = async (id: string) => {
    const res = await fetch(`/api/tasks/${id}/complete`, { method: 'PATCH' })
    if (!res.ok) return
    const data = await res.json()

    setTasks(prev => prev.map(t => t.id === id ? { ...t, is_done: true } : t))

    if (ikuseiRef.current) {
      ikuseiRef.current.reload()
    }

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

  const handleAdd = async (title: string, description: string, dueDate: string, priority: PriorityValue) => {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, due_date: dueDate || null, priority }),
    })
    if (res.ok) fetchTasks()
  }

  const handleEditOpen = (task: Task) => {
    setEditingTask(task)
  }

  const handleEdit = async (title: string, description: string, dueDate: string, priority: PriorityValue) => {
    if (!editingTask) return
    const res = await fetch(`/api/tasks/${editingTask.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, due_date: dueDate || null, priority }),
    })
    if (res.ok) {
      fetchTasks()
      setEditingTask(null)
    }
  }

  const pending = tasks.filter(t => !t.is_done)
  const done = tasks.filter(t => t.is_done)

  if (status === 'loading') return null

  return (
    <AppShell fullBleed>
      <div className="tl-page">
        {/* 💡 【修正】余白（マージン）を排除し、タスクエリア:ゲームパネル＝約6:4 (col-span-7:col-span-5) に変更 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">

          {/* 左側：タスクパネル (.task-panel) - 約60%の幅 (7/12) */}
          <div className="task-panel lg:col-span-7">
            <div className="tl-inner">
              <div className="tl-header">
                <div>
                  <h2 className="tl-title">タスク管理</h2>
                  <p className="tl-subtitle">タスクを完了すると動物が育ちます 🐾</p>
                </div>
                <button className="tl-add-btn" onClick={() => setShowForm(true)}>
                  ＋ タスクを追加
                </button>
              </div>

              {/* 未完了タスク */}
              <div className="tl-section">
                <div className="tl-section-header" onClick={() => setPendingOpen(v => !v)}>
                  <span className="tl-section-toggle">{pendingOpen ? '▼' : '▶'}</span>
                  <span>未完了</span>
                  <span className="tl-section-count">{pending.length}</span>
                </div>
                {pendingOpen && (
                  pending.length === 0 ? (
                    <div className="tl-empty">
                      タスクはありません。右上の「＋ タスクを追加」から作成してください。
                    </div>
                  ) : (
                    <div className="tl-list">
                      {pending.map(task => (
                        <TaskCard key={task.id} task={task} onComplete={handleComplete} onDelete={handleDelete} onEdit={handleEditOpen} />
                      ))}
                    </div>
                  )
                )}
              </div>

              {/* 完了済みタスク */}
              {done.length > 0 && (
                <div className="tl-section">
                  <div className="tl-section-header" onClick={() => setDoneOpen(v => !v)}>
                    <span className="tl-section-toggle">{doneOpen ? '▼' : '▶'}</span>
                    <span>完了済み</span>
                    <span className="tl-section-count">{done.length}</span>
                  </div>
                  {doneOpen && (
                    <div className="tl-list">
                      {done.map(task => (
                        <TaskCard key={task.id} task={task} onComplete={handleComplete} onDelete={handleDelete} onEdit={handleEditOpen} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 右側：ゲームパネル (.game-panel) - 横幅を従来の約1.3倍となる約40% (5/12) に拡大拡張 */}
          <div className="lg:col-span-5 lg:sticky lg:top-6 w-full">
            <IkuseiView ref={ikuseiRef} isEmbedded={true} />
          </div>
        </div>
      </div>

      {showForm && <TaskForm onAdd={handleAdd} onClose={() => setShowForm(false)} />}

      {editingTask && (
        <TaskForm
          editingTask={editingTask}
          onEdit={handleEdit}
          onClose={() => setEditingTask(null)}
        />
      )}

      {toast && (
        <div className="tl-toast">
          {toast.emoji} {toast.message}
        </div>
      )}
    </AppShell>
  )
}
