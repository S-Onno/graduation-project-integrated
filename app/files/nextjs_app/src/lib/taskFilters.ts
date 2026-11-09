/* ============================================================
 * タスクの絞り込み・分類
 *
 * 各ビューは同じタスクの一覧を受け取り、ここの関数で見せ方だけを変える。
 * (今後、検索・期限別・マトリクスの分類をここに足す)
 * ============================================================ */

import type { Task } from '@/lib/tasks'

// 未完了と完了済みに分ける(並び順は受け取った順のまま)
export function splitByDone(tasks: Task[]): { pending: Task[]; done: Task[] } {
  return {
    pending: tasks.filter((t) => !t.is_done),
    done: tasks.filter((t) => t.is_done),
  }
}
