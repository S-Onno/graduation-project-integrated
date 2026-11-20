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

  // ----- 画面の表示だけを変える(「元に戻す」を押せる間は、サーバーにはまだ保存しない) -----

  // 完了・未完了の表示を切り替える
  const setDoneLocally = useCallback((id: string, done: boolean) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, is_done: done } : t)))
  }, [])

  // 一覧から外す
  const removeLocally = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // 外したタスクを、元の位置に戻す
  const insertLocally = useCallback((task: Task, index: number) => {
    setTasks((prev) => {
      const next = prev.filter((t) => t.id !== task.id)
      next.splice(Math.min(index, next.length), 0, task)
      return next
    })
  }, [])

  // ----- サーバーに保存する -----
  // keepalive: ページを閉じる・ほかの画面に移るときでも、送信を最後まで続ける

  // 完了を保存する。成功したら、育成中の動物に起きたことを返す(失敗したら null)
  const completeOnServer = useCallback(async (id: string, keepalive = false): Promise<CompleteResult | null> => {
    const res = await fetch(`/api/tasks/${id}/complete`, { method: 'PATCH', keepalive })
    if (!res.ok) return null
    return res.json()
  }, [])

  // 削除を保存する。成功したら true
  const removeOnServer = useCallback(async (id: string, keepalive = false) => {
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE', keepalive })
    return res.ok
  }, [])

  return {
    tasks,
    reload,
    add,
    update,
    setDoneLocally,
    removeLocally,
    insertLocally,
    completeOnServer,
    removeOnServer,
  }
}
