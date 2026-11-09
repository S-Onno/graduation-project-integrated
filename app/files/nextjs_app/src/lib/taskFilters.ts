/* ============================================================
 * タスクの絞り込み・分類
 *
 * 各ビューは同じタスクの一覧を受け取り、ここの関数で見せ方だけを変える。
 * (今後、期限別・マトリクスの分類をここに足す)
 * ============================================================ */

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
