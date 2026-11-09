'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTasks } from '@/hooks/useTasks'
import { TaskForm } from '@/components/task/TaskForm'
import { filterTasks } from '@/lib/taskFilters'
import type { CompleteResult, PriorityValue, Task } from '@/lib/tasks'

/* ============================================================
 * タスク画面の共通の状態
 *
 * タスクの一覧と操作(完了・削除・追加・編集)、検索の言葉を、タスク画面の各ビューで共有する。
 * 入力フォームと通知もここで表示する。
 *
 * 完了と削除は、すぐに画面に反映し、UNDO_MS の間「元に戻す」を出す。
 * その間はサーバーに保存せず、時間が過ぎてから保存する(完了すると動物が育つので、
 * 保存してから取り消すと育成まで巻き戻す必要があるため)。
 * 次の操作をしたとき・ほかの画面に移ったとき・ページを閉じたときは、待っている操作をすぐ保存する。
 * ============================================================ */

const UNDO_MS = 5000 // 「元に戻す」を押せる時間
const TOAST_MS = 3000 // ふつうの通知を出しておく時間

interface Toast {
  id: number
  message: string
  actionLabel?: string // ボタンの文字(「元に戻す」)
  onAction?: () => void
}

// 「元に戻す」を押せる間、保存を待っている操作
interface PendingAction {
  kind: 'complete' | 'remove'
  task: Task
  index: number // 削除したタスクが一覧の何番目にあったか(元に戻すときに使う)
  timer: ReturnType<typeof setTimeout>
}

interface TasksContextValue {
  tasks: Task[] // すべてのタスク
  visibleTasks: Task[] // 検索に合うタスク(検索していなければ、すべて)
  query: string // 検索の言葉
  setQuery: (query: string) => void
  complete: (id: string) => void
  remove: (id: string) => void
  openAdd: (date?: Date) => void // date を渡すと、その日(終日)を期限に入れた状態で開く
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
  onCompleted?: () => void // タスクの完了を保存したあとに呼ぶ(育成パネルの読み直しなど)
  children: ReactNode
}) {
  const {
    tasks,
    add,
    update,
    setDoneLocally,
    removeLocally,
    insertLocally,
    completeOnServer,
    removeOnServer,
  } = useTasks(enabled)
  const [showForm, setShowForm] = useState(false)
  const [addDate, setAddDate] = useState<Date | undefined>(undefined)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [query, setQuery] = useState('')

  const pendingRef = useRef<PendingAction | null>(null)
  const tasksRef = useRef(tasks)
  const onCompletedRef = useRef(onCompleted)
  const toastRef = useRef<Toast | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const toastIdRef = useRef(0)
  const toastQueueRef = useRef<string[]>([]) // 「元に戻す」が出ている間に届いた通知

  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])
  useEffect(() => {
    onCompletedRef.current = onCompleted
  }, [onCompleted])

  // ----- 通知 -----

  const showToast = useCallback(
    (message: string, options: { duration?: number; actionLabel?: string; onAction?: () => void } = {}) => {
      const open = (text: string, opts: typeof options) => {
        clearTimeout(toastTimerRef.current)
        toastIdRef.current += 1
        const next: Toast = { id: toastIdRef.current, message: text, actionLabel: opts.actionLabel, onAction: opts.onAction }
        toastRef.current = next
        setToast(next)
        toastTimerRef.current = setTimeout(() => {
          toastRef.current = null
          setToast(null)
          // 順番待ちの通知があれば、続けて出す
          const queued = toastQueueRef.current.shift()
          if (queued) open(queued, {})
        }, opts.duration ?? TOAST_MS)
      }
      open(message, options)
    },
    [],
  )

  // お知らせの通知。「元に戻す」が出ている間は、消えるまで順番待ちにする
  const showInfo = useCallback(
    (message: string) => {
      if (toastRef.current?.actionLabel) toastQueueRef.current.push(message)
      else showToast(message)
    },
    [showToast],
  )

  // 完了を保存したあとに、育成中の動物に起きたことを知らせる
  const reportCompletion = useCallback(
    (data: CompleteResult) => {
      const update = data.animalUpdate
      if (update?.type === 'acquired') {
        showInfo(`${update.animal?.animal.name ?? '動物'}の赤ちゃんがやってきました`)
      } else if (update?.type === 'growUp') {
        showInfo(`${update.animal?.animal.name}が${STAGE_LABEL[update.newStage ?? ''] ?? ''}に育ちました`)
      } else {
        showInfo('育成中の動物が少し育ちました')
      }
      if (data.areaUnlocked) {
        setTimeout(() => showInfo(`新しいエリア「${data.areaUnlocked}」に入れるようになりました`), 1500)
      }
    },
    [showInfo],
  )

  // ----- 待っている操作の保存 -----

  // 操作をサーバーに保存する。keepalive のとき(画面を離れるとき)は結果を表示しない
  const commit = useCallback(
    async (action: PendingAction, keepalive: boolean) => {
      const { task } = action
      if (action.kind === 'complete') {
        const data = await completeOnServer(task.id, keepalive)
        if (keepalive) return
        if (!data) {
          setDoneLocally(task.id, false)
          showInfo('完了を保存できませんでした')
          return
        }
        onCompletedRef.current?.()
        reportCompletion(data)
      } else {
        const ok = await removeOnServer(task.id, keepalive)
        if (keepalive) return
        if (!ok) {
          insertLocally(task, action.index)
          showInfo('削除できませんでした')
        }
      }
    },
    [completeOnServer, removeOnServer, setDoneLocally, insertLocally, showInfo, reportCompletion],
  )

  // 待っている操作があれば、すぐ保存する
  const flushPending = useCallback(
    (keepalive = false) => {
      const action = pendingRef.current
      if (!action) return Promise.resolve()
      clearTimeout(action.timer)
      pendingRef.current = null
      return commit(action, keepalive)
    },
    [commit],
  )

  // ほかの画面に移る・ページを閉じるときは、待っている操作をすぐ保存する
  useEffect(() => {
    const onPageHide = () => {
      void flushPending(true)
    }
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      void flushPending(true)
    }
  }, [flushPending])

  // 待っている操作を取り消して、画面を元に戻す
  const undo = () => {
    const action = pendingRef.current
    if (!action) return
    clearTimeout(action.timer)
    pendingRef.current = null
    if (action.kind === 'complete') setDoneLocally(action.task.id, false)
    else insertLocally(action.task, action.index)
    showToast('元に戻しました')
  }

  // 操作を待たせて、「元に戻す」を出す
  const startPending = (kind: PendingAction['kind'], task: Task, index: number, message: string) => {
    const timer = setTimeout(() => {
      if (pendingRef.current?.timer === timer) void flushPending()
    }, UNDO_MS)
    pendingRef.current = { kind, task, index, timer }
    showToast(message, { duration: UNDO_MS, actionLabel: '元に戻す', onAction: undo })
  }

  // ----- 各ビューから呼ぶ操作 -----

  const complete = (id: string) => {
    void flushPending()
    const task = tasksRef.current.find((t) => t.id === id)
    if (!task || task.is_done) return
    setDoneLocally(id, true)
    startPending('complete', task, 0, '完了しました')
  }

  const remove = (id: string) => {
    void flushPending()
    const index = tasksRef.current.findIndex((t) => t.id === id)
    if (index < 0) return
    const task = tasksRef.current[index]
    removeLocally(id)
    startPending('remove', task, index, '削除しました')
  }

  // 追加・編集の前に、待っている操作を保存しておく(一覧を読み直したときに、消したタスクが戻らないように)
  const handleAdd = async (title: string, description: string, dueDate: string, priority: PriorityValue) => {
    await flushPending()
    await add({ title, description, dueDate, priority })
  }

  const handleEdit = async (title: string, description: string, dueDate: string, priority: PriorityValue) => {
    if (!editingTask) return
    await flushPending()
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
    openAdd: (date) => {
      setAddDate(date)
      setShowForm(true)
    },
    openEdit: (task) => setEditingTask(task),
  }

  return (
    <TasksContext.Provider value={value}>
      {children}

      {showForm && (
        <TaskForm onAdd={handleAdd} defaultDate={addDate} onClose={() => setShowForm(false)} />
      )}

      {editingTask && (
        <TaskForm
          editingTask={editingTask}
          onEdit={handleEdit}
          onClose={() => setEditingTask(null)}
        />
      )}

      {toast && (
        <div key={toast.id} className="tl-toast" role="status">
          <span>{toast.message}</span>
          {toast.actionLabel && (
            <button
              className="tl-toast-action"
              onClick={() => {
                toast.onAction?.()
              }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
    </TasksContext.Provider>
  )
}
