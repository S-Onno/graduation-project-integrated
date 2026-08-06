'use client'

interface Task {
  id: string
  title: string
  description?: string | null
  due_date?: string | null
  is_done: boolean
}

interface Props {
  task: Task
  onComplete: (id: string) => void
  onDelete: (id: string) => void
}

export function TaskCard({ task, onComplete, onDelete }: Props) {
  const isOverdue = !task.is_done && !!task.due_date && new Date(task.due_date) < new Date()

  const isAllDay = !!task.due_date &&
    new Date(task.due_date).getHours() === 23 &&
    new Date(task.due_date).getMinutes() === 59 &&
    new Date(task.due_date).getSeconds() === 59

  const dueDateText = task.due_date
    ? isAllDay
      ? new Date(task.due_date).toLocaleDateString('ja-JP', {
          year: 'numeric', month: '2-digit', day: '2-digit',
        }) + '（終日）'
      : new Date(task.due_date).toLocaleString('ja-JP', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit',
        })
    : null

  return (
    <div className={`tl-item${task.is_done ? ' done' : ''}`}>
      <button
        className={`tl-checkbox${task.is_done ? ' checked' : ''}`}
        onClick={() => !task.is_done && onComplete(task.id)}
        disabled={task.is_done}
        aria-label="完了"
      >
        {task.is_done && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div className="tl-item-content">
        <p className="tl-item-title">{task.title}</p>
        {task.description && (
          <p className="tl-item-desc">{task.description}</p>
        )}
        {dueDateText && (
          <div>
            <span className={`tl-due-pill${isOverdue ? ' overdue' : ''}${isAllDay ? ' allday' : ''}`}>
              {dueDateText}{isOverdue && '（期限切れ）'}
            </span>
          </div>
        )}
      </div>

      {!task.is_done && (
        <button className="tl-delete-btn" onClick={() => onDelete(task.id)} aria-label="削除">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0v13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  )
}
