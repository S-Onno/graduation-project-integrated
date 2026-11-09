/* ============================================================
 * タスクの型と、表示に使う共通の関数
 *
 * タスク画面の各ビュー(一覧、今後のカレンダーやマトリクス)で共通して使う。
 * ============================================================ */

export type PriorityValue = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'

// GET /api/tasks が返すタスク(画面で使う項目)
export interface Task {
  id: string
  title: string
  description?: string | null
  due_date?: string | null // 期限(ISO 形式)。終日のときは 23:59:59
  priority: PriorityValue
  is_done: boolean
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
