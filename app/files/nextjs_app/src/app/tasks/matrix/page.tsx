'use client'

import { TaskCard } from '@/components/task/TaskCard'
import { useTasksContext } from '@/components/task/TasksContext'
import { classifyMatrix, MATRIX_LABEL, URGENT_DAYS } from '@/lib/taskFilters'
import type { MatrixQuadrant } from '@/lib/taskFilters'

/* ============================================================
 * アイゼンハワーマトリクス
 *
 * 未完了のタスクを「重要か(優先度 高・中)」と「緊急か(期限が URGENT_DAYS 日以内・期限切れ)」で
 * 4つに分けて表示する。PC は 2×2、スマホは縦に並べる。
 * サイドバーの検索で絞り込んだタスクだけを表示する。
 * 見出し・追加ボタン・育成パネルは layout.tsx が表示する。
 * ============================================================ */

// 表示する順番(PC では 左上 → 右上 → 左下 → 右下)
const QUADRANTS: { key: MatrixQuadrant; title: string; axis: string; empty: string }[] = [
  { key: 'doNow', title: MATRIX_LABEL.doNow, axis: '重要 × 緊急', empty: '急ぎの大事なタスクはありません。' },
  { key: 'plan', title: MATRIX_LABEL.plan, axis: '重要 × 緊急でない', empty: '先の大事なタスクはありません。' },
  { key: 'quick', title: MATRIX_LABEL.quick, axis: '重要でない × 緊急', empty: '急ぎの細かいタスクはありません。' },
  { key: 'later', title: MATRIX_LABEL.later, axis: '重要でない × 緊急でない', empty: '後回しのタスクはありません。' },
]

export default function TaskMatrixPage() {
  const { visibleTasks, complete, remove, openEdit, openDetail } = useTasksContext()
  const matrix = classifyMatrix(visibleTasks, new Date())

  return (
    <div className="tl-matrix">
      <p className="tl-matrix-hint">
        重要 = 優先度が「高・中」、緊急 = 期限が{URGENT_DAYS}日以内か期限切れ（完了済みは表示しません）
      </p>

      {/* 列の見出し(PC のみ) */}
      <div className="tl-matrix-cols" aria-hidden="true">
        <span>緊急</span>
        <span>緊急でない</span>
      </div>

      <div className="tl-matrix-grid">
        {QUADRANTS.map((q) => (
          <section key={q.key} className={`tl-quad tl-quad-${q.key}`} aria-label={`${q.title}（${q.axis}）`}>
            <div className="tl-quad-head">
              <span className="tl-quad-title">{q.title}</span>
              <span className="tl-quad-axis">{q.axis}</span>
              <span className="tl-quad-count">{matrix[q.key].length}</span>
            </div>
            {matrix[q.key].length === 0 ? (
              <p className="tl-quad-empty">{q.empty}</p>
            ) : (
              <div className="tl-list">
                {matrix[q.key].map((task) => (
                  <TaskCard key={task.id} task={task} onComplete={complete} onDelete={remove} onEdit={openEdit} onOpen={openDetail} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
