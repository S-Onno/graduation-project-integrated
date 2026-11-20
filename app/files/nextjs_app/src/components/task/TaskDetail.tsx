'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Icon } from '@/components/ui/Icon'
import { MATRIX_LABEL, quadrantOf } from '@/lib/taskFilters'
import { dueStatus, isAllDayDue, PRIORITY_LABEL } from '@/lib/tasks'
import type { Task } from '@/lib/tasks'

/* ============================================================
 * タスクの詳細(カードのタイトルやメモを押すと開く)
 *
 * PC は画面の中央、スマホは下からせり上がる(追加フォームと同じ見た目)。
 * 閉じるボタン・外を押す・Esc で閉じる。完了・編集・削除もここからできる。
 * ============================================================ */

function formatDate(iso: string): string {
  return format(new Date(iso), 'yyyy年M月d日（E）', { locale: ja })
}

function formatDue(iso: string): string {
  return isAllDayDue(iso)
    ? `${formatDate(iso)} 終日`
    : format(new Date(iso), 'yyyy年M月d日（E） H:mm', { locale: ja })
}

export function TaskDetail({
  task,
  onClose,
  onComplete,
  onEdit,
  onDelete,
}: {
  task: Task
  onClose: () => void
  onComplete: (task: Task) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
}) {
  const [now] = useState(() => new Date())
  const due = dueStatus(task, now)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="tl-modal-overlay" onClick={onClose}>
      <div
        className="tl-modal tl-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tl-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tl-detail-head">
          <h3 id="tl-detail-title" className={task.is_done ? 'done' : ''}>
            {task.title}
          </h3>
          <button className="tl-detail-close" onClick={onClose} aria-label="閉じる">
            <Icon name="close" size={18} />
          </button>
        </div>

        {task.description ? (
          <p className="tl-detail-memo">{task.description}</p>
        ) : (
          <p className="tl-detail-memo empty">メモはありません</p>
        )}

        <dl className="tl-detail-meta">
          <dt>期限</dt>
          <dd>
            {task.due_date ? formatDue(task.due_date) : 'なし'}
            {due && <span className={`tl-detail-due${due.overdue ? ' overdue' : ''}`}>{due.text}</span>}
          </dd>

          <dt>優先度</dt>
          <dd>
            <span className={`tl-detail-priority priority-${task.priority.toLowerCase()}`}>
              {PRIORITY_LABEL[task.priority]}
            </span>
          </dd>

          {!task.is_done && (
            <>
              <dt>分類</dt>
              <dd>{MATRIX_LABEL[quadrantOf(task, now)]}</dd>
            </>
          )}

          <dt>作成日</dt>
          <dd>{formatDate(task.created_at)}</dd>

          {task.is_done && task.done_at && (
            <>
              <dt>完了した日</dt>
              <dd>{formatDate(task.done_at)}</dd>
            </>
          )}
        </dl>

        <div className="tl-detail-actions">
          {!task.is_done && (
            <button className="tl-btn-primary" onClick={() => onComplete(task)}>
              完了にする
            </button>
          )}
          <button className="tl-btn-ghost" onClick={() => onEdit(task)}>
            編集
          </button>
          {!task.is_done && (
            <button className="tl-btn-ghost tl-detail-delete" onClick={() => onDelete(task)}>
              削除
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
