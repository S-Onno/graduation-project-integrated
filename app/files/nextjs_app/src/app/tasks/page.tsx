'use client'

import { useState } from 'react'
import { TaskCard } from '@/components/task/TaskCard'
import { useTasksContext } from '@/components/task/TasksContext'
import { splitByDone } from '@/lib/taskFilters'

// タスク一覧(未完了と完了済み)。見出しや育成パネルは layout.tsx が表示する
export default function TaskListPage() {
  const { visibleTasks, query, complete, remove, openEdit } = useTasksContext()
  const [pendingOpen, setPendingOpen] = useState(true)
  const [doneOpen, setDoneOpen] = useState(true)
  const { pending, done } = splitByDone(visibleTasks)
  const searching = query.trim().length > 0

  return (
    <>
      {/* 未完了タスク */}
      <div className="tl-section">
        <div className="tl-section-header" onClick={() => setPendingOpen(v => !v)}>
          <span className="tl-section-toggle">{pendingOpen ? '▼' : '▶'}</span>
          <span>未完了</span>
          <span className="tl-section-count">{pending.length}</span>
        </div>
        {pendingOpen && (
          pending.length === 0 ? (
            <div className="tl-empty">
              {searching
                ? `「${query.trim()}」に一致する未完了のタスクはありません。`
                : 'まだメモはありません。「タスクを追加」から書きこんでください。'}
            </div>
          ) : (
            <div className="tl-list">
              {pending.map(task => (
                <TaskCard key={task.id} task={task} onComplete={complete} onDelete={remove} onEdit={openEdit} />
              ))}
            </div>
          )
        )}
      </div>

      {/* 完了済みタスク */}
      {done.length > 0 && (
        <div className="tl-section">
          <div className="tl-section-header" onClick={() => setDoneOpen(v => !v)}>
            <span className="tl-section-toggle">{doneOpen ? '▼' : '▶'}</span>
            <span>完了済み</span>
            <span className="tl-section-count">{done.length}</span>
          </div>
          {doneOpen && (
            <div className="tl-list">
              {done.map(task => (
                <TaskCard key={task.id} task={task} onComplete={complete} onDelete={remove} onEdit={openEdit} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
