/* ============================================================
 * タスクの絞り込み・分類
 *
 * 各ビューは同じタスクの一覧を受け取り、ここの関数で見せ方だけを変える。
 * ============================================================ */

import { addDays, format, startOfDay } from 'date-fns'
import type { Task } from '@/lib/tasks'

// 未完了と完了済みに分ける(並び順は受け取った順のまま)
export function splitByDone(tasks: Task[]): { pending: Task[]; done: Task[] } {
  return {
    pending: tasks.filter((t) => !t.is_done),
    done: tasks.filter((t) => t.is_done),
  }
}

// 検索用に文字をそろえる。全角と半角(NFKC)、大文字と小文字、カタカナとひらがなを区別しない
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

// 検索の言葉に分ける(スペースで区切る。全角スペースも NFKC で半角になる)
export function parseQuery(query: string): string[] {
  return normalizeForSearch(query).split(/\s+/).filter(Boolean)
}

// タイトルかメモに、すべての言葉が含まれているか(言葉がなければ true)
export function matchesQuery(task: Task, words: string[]): boolean {
  if (words.length === 0) return true
  const text = normalizeForSearch(`${task.title}\n${task.description ?? ''}`)
  return words.every((word) => text.includes(word))
}

// 検索の言葉に合うタスクだけを返す(言葉が空なら、すべて)
export function filterTasks(tasks: Task[], query: string): Task[] {
  const words = parseQuery(query)
  if (words.length === 0) return tasks
  return tasks.filter((task) => matchesQuery(task, words))
}

// 日付を、期限の日ごとに分けるときのキー(ブラウザの時刻で 'yyyy-MM-dd')にする
export function dayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

// 期限のあるタスクを、期限の日ごとに分ける。同じ日の中は、未完了 → 完了済み、期限の早い順
export function groupByDueDay(tasks: Task[]): Map<string, Task[]> {
  const days = new Map<string, Task[]>()
  for (const task of tasks) {
    if (!task.due_date) continue
    const key = dayKey(new Date(task.due_date))
    const list = days.get(key) ?? []
    list.push(task)
    days.set(key, list)
  }
  for (const list of days.values()) {
    list.sort(
      (a, b) =>
        Number(a.is_done) - Number(b.is_done) ||
        new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime(),
    )
  }
  return days
}

// ===== アイゼンハワーマトリクス =====

export type MatrixQuadrant = 'doNow' | 'plan' | 'quick' | 'later'

// 期限が「今日から何日後まで」なら緊急とするか(期限切れも緊急)
export const URGENT_DAYS = 3

// 重要: 優先度が「高・中」
export function isImportant(task: Task): boolean {
  return task.priority === 'HIGH' || task.priority === 'MEDIUM'
}

// 緊急: 期限切れか、今日から URGENT_DAYS 日後の終わりまでに期限がある
export function isUrgent(task: Task, now: Date): boolean {
  if (!task.due_date) return false
  const limit = addDays(startOfDay(now), URGENT_DAYS + 1)
  return new Date(task.due_date) < limit
}

// 未完了のタスクを4つに分ける。各マスの中は、期限の近い順(期限なしは最後)
export function classifyMatrix(tasks: Task[], now: Date): Record<MatrixQuadrant, Task[]> {
  const result: Record<MatrixQuadrant, Task[]> = { doNow: [], plan: [], quick: [], later: [] }
  for (const task of tasks) {
    if (task.is_done) continue
    const important = isImportant(task)
    const urgent = isUrgent(task, now)
    const quadrant: MatrixQuadrant = important
      ? urgent ? 'doNow' : 'plan'
      : urgent ? 'quick' : 'later'
    result[quadrant].push(task)
  }
  const dueTime = (task: Task) => (task.due_date ? new Date(task.due_date).getTime() : Infinity)
  for (const list of Object.values(result)) list.sort((a, b) => dueTime(a) - dueTime(b))
  return result
}
