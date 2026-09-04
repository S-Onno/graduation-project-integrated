'use client'

interface Task {
  id: string
  title: string
  description?: string | null
  is_done: boolean
}

interface Props {
  task: Task
  onComplete: (id: string) => void
  onDelete: (id: string) => void
}

export function TaskCard({ task, onComplete, onDelete }: Props) {
  return (
    <div className={`task-card${task.is_done ? ' done' : ''}`}>
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
      </div>

      {!task.is_done && (
        <button className="btn-danger" style={{ fontSize: '12px', padding: '6px 12px' }} onClick={() => onDelete(task.id)}>
          削除
        </button>
      )}
    </div>
  )
}
