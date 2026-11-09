'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CompleteResult, Task, TaskInput } from '@/lib/tasks'

function toBody(input: TaskInput) {
  return JSON.stringify({
    title: input.title,
    description: input.description,
    due_date: input.dueDate || null,
    priority: input.priority,
  })
}

// タスクの取得と、作成・編集・完了・削除の API 呼び出しをまとめる。
// enabled が true になったら(ログインしたら)一覧を読み込む
export function useTasks(enabled: boolean) {
  const [tasks, setTasks] = useState<Task[]>([])

  const reload = useCallback(async () => {
    const res = await fetch('/api/tasks')
    if (res.ok) setTasks(await res.json())
  }, [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetch('/api/tasks')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Task[] | null) => {
        if (!cancelled && data) setTasks(data)
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  // 作成できたら一覧を読み直す。成功したら true
  const add = useCallback(
    async (input: TaskInput) => {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: toBody(input),
      })
      if (res.ok) await reload()
      return res.ok
    },
    [reload],
  )

  // 編集できたら一覧を読み直す。成功したら true
  const update = useCallback(
    async (id: string, input: TaskInput) => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: toBody(input),
      })
      if (res.ok) await reload()
      return res.ok
    },
    [reload],
  )

  // 完了にする。成功したら、育成中の動物に起きたことを返す(失敗したら null)
  const complete = useCallback(async (id: string): Promise<CompleteResult | null> => {
    const res = await fetch(`/api/tasks/${id}/complete`, { method: 'PATCH' })
    if (!res.ok) return null
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, is_done: true } : t)))
    return res.json()
  }, [])

  // 削除する。成功したら true
  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    if (res.ok) setTasks((prev) => prev.filter((t) => t.id !== id))
    return res.ok
  }, [])

  return { tasks, reload, add, update, complete, remove }
}
