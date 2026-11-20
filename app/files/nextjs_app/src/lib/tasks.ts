/* ============================================================
 * タスクの型と、表示に使う共通の関数
 *
 * タスク画面の各ビュー(一覧、今後のカレンダーやマトリクス)で共通して使う。
 * ============================================================ */

import { differenceInCalendarDays } from 'date-fns'

export type PriorityValue = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'

// GET /api/tasks が返すタスク(画面で使う項目)
export interface Task {
  id: string
  title: string
  description?: string | null
  due_date?: string | null // 期限(ISO 形式)。終日のときは 23:59:59
  priority: PriorityValue
  is_done: boolean
  done_at?: string | null // 完了した日時
  created_at: string
}

// タスクを作るとき・編集するときに送る内容
export interface TaskInput {
  title: string
  description: string
  dueDate: string // 空文字なら期限なし
  priority: PriorityValue
}

// タスクを完了したときに、育成中の動物に起きたこと(PATCH /api/tasks/[id]/complete の結果)
export interface AnimalUpdate {
  type: 'acquired' | 'progress' | 'growUp'
  prevStage?: string
  newStage?: string
  animal?: { animal: { name: string }; stage: string; task_count: number }
}

export interface CompleteResult {
  animalUpdate?: AnimalUpdate
  areaUnlocked?: string | null
}

// 期限が「終日」か(終日は 23:59:59 で保存している)
export function isAllDayDue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false
  const d = new Date(dueDate)
  return d.getHours() === 23 && d.getMinutes() === 59 && d.getSeconds() === 59
}

export const PRIORITY_LABEL: Record<PriorityValue, string> = {
  HIGH: '高',
  MEDIUM: '中',
  LOW: '低',
  NONE: 'なし',
}

// 期限までの残りを、日付の単位で言葉にする(期限がない・完了済みなら null)
export function dueStatus(task: Task, now: Date): { text: string; overdue: boolean } | null {
  if (!task.due_date || task.is_done) return null
  const due = new Date(task.due_date)
  const days = differenceInCalendarDays(due, now)
  if (due < now) {
    return { text: days < 0 ? `${-days}日すぎています` : '期限をすぎています', overdue: true }
  }
  if (days === 0) return { text: '今日まで', overdue: false }
  if (days === 1) return { text: '明日まで', overdue: false }
  return { text: `あと${days}日`, overdue: false }
}
