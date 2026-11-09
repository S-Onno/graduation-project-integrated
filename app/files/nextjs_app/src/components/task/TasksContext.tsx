'use client'

import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { useTasks } from '@/hooks/useTasks'
import { TaskForm } from '@/components/task/TaskForm'
import { filterTasks } from '@/lib/taskFilters'
import type { PriorityValue, Task } from '@/lib/tasks'

/* ============================================================
 * タスク画面の共通の状態
 *
 * タスクの一覧と操作(完了・削除・追加・編集)、検索の言葉を、タスク画面の各ビューで共有する。
 * 入力フォームと、完了したときの通知もここで表示する。
 * ============================================================ */

interface Toast {
  message: string
  emoji: string
}

interface TasksContextValue {
  tasks: Task[] // すべてのタスク
  visibleTasks: Task[] // 検索に合うタスク(検索していなければ、すべて)
  query: string // 検索の言葉
  setQuery: (query: string) => void
  complete: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  openAdd: () => void
  openEdit: (task: Task) => void
}

const TasksContext = createContext<TasksContextValue | null>(null)

export function useTasksContext(): TasksContextValue {
  const value = useContext(TasksContext)
  if (!value) throw new Error('useTasksContext は TasksProvider の中で使ってください')
  return value
}

const STAGE_LABEL: Record<string, string> = { CHILD: '子供', ADULT: '大人' }

export function TasksProvider({
  enabled,
  onCompleted,
  children,
}: {
  enabled: boolean // true になったら(ログインしたら)タスクを読み込む
  onCompleted?: () => void // タスクを完了したあとに呼ぶ(育成パネルの読み直しなど)
  children: ReactNode
}) {
  const { tasks, add, update, complete: completeTask, remove: removeTask } = useTasks(enabled)
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [query, setQuery] = useState('')

  const showToast = (message: string, emoji: string) => {
    setToast({ message, emoji })
    setTimeout(() => setToast(null), 3000)
  }

  const complete = async (id: string) => {
    const data = await completeTask(id)
    if (!data) return
    onCompleted?.()

    const update = data.animalUpdate
    if (update?.type === 'acquired') {
      showToast(`🐣 ${update.animal?.animal.name ?? '動物'} の赤ちゃんを獲得しました！`, '🎉')
    } else if (update?.type === 'growUp') {
      showToast(`✨ ${update.animal?.animal.name} が${STAGE_LABEL[update.newStage ?? ''] ?? ''}に成長！`, '🌟')
    } else {
      showToast('タスク完了！育成中の動物が成長しました 🐾', '✅')
    }

    if (data.areaUnlocked) {
      setTimeout(() => showToast(`🎊 新エリア「${data.areaUnlocked}」が解放されました！`, '🗺️'), 1500)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('このタスクを削除しますか？')) return
    await removeTask(id)
  }

  const handleAdd = async (title: string, description: string, dueDate: string, priority: PriorityValue) => {
    await add({ title, description, dueDate, priority })
  }

  const handleEdit = async (title: string, description: string, dueDate: string, priority: PriorityValue) => {
    if (!editingTask) return
    const ok = await update(editingTask.id, { title, description, dueDate, priority })
    if (ok) setEditingTask(null)
  }

  const value: TasksContextValue = {
    tasks,
    visibleTasks: filterTasks(tasks, query),
    query,
    setQuery,
    complete,
    remove,
    openAdd: () => setShowForm(true),
    openEdit: (task) => setEditingTask(task),
  }

  return (
    <TasksContext.Provider value={value}>
      {children}

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
    </TasksContext.Provider>
  )
}
