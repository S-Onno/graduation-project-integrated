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
    <div className={`task-card${task.is_done ? ' done' : ''}${isOverdue ? ' overdue' : ''}`}>
      <button
        className={`task-check${task.is_done ? ' checked' : ''}`}
        onClick={() => !task.is_done && onComplete(task.id)}
        disabled={task.is_done}
        aria-label="完了"
      >
        {task.is_done ? '✓' : ''}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="task-title" style={{ fontSize: '15px', fontWeight: 600 }}>{task.title}</p>
        {task.description && (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {task.description}
          </p>
        )}
        {dueDateText && (
          <p style={{ fontSize: '12px', color: isOverdue ? 'var(--accent-red)' : 'var(--text-muted)', marginTop: '4px' }}>
            期限: {dueDateText}
            {isOverdue && ' (期限切れ)'}
          </p>
        )}
      </div>

      {!task.is_done && (
        <button className="btn-danger" style={{ fontSize: '12px', padding: '6px 12px' }} onClick={() => onDelete(task.id)}>
          削除
        </button>
      )}
    </div>
  )
}