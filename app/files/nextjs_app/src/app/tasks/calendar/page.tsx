'use client'

import { useState } from 'react'
import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ja } from 'date-fns/locale'
import { TaskCard } from '@/components/task/TaskCard'
import { useTasksContext } from '@/components/task/TasksContext'
import { dayKey, groupByDueDay } from '@/lib/taskFilters'
import type { Task } from '@/lib/tasks'

/* ============================================================
 * タスクのカレンダー(月表示)
 *
 * - 期限の日のマスに、タスクを最大 MAX_CHIPS 件表示する(スマホでは点で件数を示す)
 * - 日付を押すと、下にその日のタスクを出す(一覧と同じく、完了・編集・削除ができる)
 * - サイドバーの検索で絞り込んだタスクだけを表示する
 * - 見出し・追加ボタン・育成パネルは layout.tsx が表示する
 * ============================================================ */

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
const MAX_CHIPS = 2 // 1つのマスに表示するタスクの数(それ以上は「+N」)
const MAX_DOTS = 3 // スマホで、1つのマスに表示する点の数

const PRIORITY_CLASS: Record<Task['priority'], string> = {
  HIGH: ' priority-high',
  MEDIUM: ' priority-medium',
  LOW: ' priority-low',
  NONE: '',
}

// 月の表示に使う6週間(42日)。日曜始まり
function monthDays(month: Date): Date[] {
  const first = startOfWeek(startOfMonth(month), { weekStartsOn: 0 })
  return Array.from({ length: 42 }, (_, i) => addDays(first, i))
}

function isOverdue(task: Task, now: Date): boolean {
  return !task.is_done && !!task.due_date && new Date(task.due_date) < now
}

export default function TaskCalendarPage() {
  const { visibleTasks, complete, remove, openEdit, openAdd, openDetail } = useTasksContext()
  const [today] = useState(() => new Date())
  const [month, setMonth] = useState(() => startOfMonth(today))
  const [selected, setSelected] = useState(today)

  const byDay = groupByDueDay(visibleTasks)
  const days = monthDays(month)
  const selectedTasks = byDay.get(dayKey(selected)) ?? []
  const noDueCount = visibleTasks.filter((t) => !t.due_date && !t.is_done).length
  const now = new Date()

  const goToday = () => {
    setMonth(startOfMonth(today))
    setSelected(today)
  }

  // 前の月・次の月の日を押したら、その月に移る。
  // すでに選ばれている日をもう一度押したら、その日にタスクを追加する
  const selectDay = (day: Date) => {
    if (isSameDay(day, selected)) {
      openAdd(day)
      return
    }
    setSelected(day)
    if (!isSameMonth(day, month)) setMonth(startOfMonth(day))
  }

  return (
    <div className="tl-cal">
      {/* 月の切り替え */}
      <div className="tl-cal-nav">
        <button className="tl-cal-nav-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="前の月">
          ‹
        </button>
        <h3 className="tl-cal-month">{format(month, 'yyyy年 M月', { locale: ja })}</h3>
        <button className="tl-cal-nav-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="次の月">
          ›
        </button>
        <button className="tl-cal-today-btn" onClick={goToday}>
          今日
        </button>
      </div>

      {/* 曜日 */}
      <div className="tl-cal-grid tl-cal-weekdays">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`tl-cal-weekday${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`}>
            {w}
          </div>
        ))}
      </div>

      {/* 日付のマス */}
      <div className="tl-cal-grid">
        {days.map((day) => {
          const tasks = byDay.get(dayKey(day)) ?? []
          const pending = tasks.filter((t) => !t.is_done).length
          const classes = [
            'tl-cal-day',
            isSameMonth(day, month) ? '' : 'outside',
            isSameDay(day, today) ? 'today' : '',
            isSameDay(day, selected) ? 'selected' : '',
            day.getDay() === 0 ? 'sun' : day.getDay() === 6 ? 'sat' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={dayKey(day)}
              className={classes}
              onClick={() => selectDay(day)}
              aria-label={`${format(day, 'M月d日(E)', { locale: ja })} タスク${tasks.length}件${isSameDay(day, selected) ? '（もう一度押すと追加）' : ''}`}
              aria-pressed={isSameDay(day, selected)}
            >
              <span className="tl-cal-date">{day.getDate()}</span>

              {/* PC: タスク名 */}
              <span className="tl-cal-chips">
                {tasks.slice(0, MAX_CHIPS).map((task) => (
                  <span
                    key={task.id}
                    className={`tl-cal-chip${PRIORITY_CLASS[task.priority]}${task.is_done ? ' done' : ''}${isOverdue(task, now) ? ' overdue' : ''}`}
                  >
                    {task.title}
                  </span>
                ))}
                {tasks.length > MAX_CHIPS && <span className="tl-cal-more">+{tasks.length - MAX_CHIPS}</span>}
              </span>

              {/* スマホ: 点で件数を示す(未完了は濃く、完了済みは薄く) */}
              {tasks.length > 0 && (
                <span className="tl-cal-dots" aria-hidden="true">
                  {tasks.slice(0, MAX_DOTS).map((task) => (
                    <span key={task.id} className={`tl-cal-dot${task.is_done ? ' done' : ''}`} />
                  ))}
                  {tasks.length > MAX_DOTS && <span className="tl-cal-dot-more">+</span>}
                </span>
              )}
              {pending > 0 && <span className="sr-only">未完了{pending}件</span>}
            </button>
          )
        })}
      </div>

      {/* 選んだ日のタスク */}
      <div className="tl-cal-day-panel">
        <div className="tl-cal-day-head">
          <span className="tl-cal-day-title">
            {format(selected, 'M月d日（E）', { locale: ja })}のタスク
            <span className="tl-section-count">{selectedTasks.length}</span>
          </span>
          <button className="tl-cal-add-btn" onClick={() => openAdd(selected)}>
            ＋ この日に追加
          </button>
        </div>
        {selectedTasks.length === 0 ? (
          <div className="tl-empty">この日が期限のタスクはありません。</div>
        ) : (
          <div className="tl-list">
            {selectedTasks.map((task) => (
              <TaskCard key={task.id} task={task} onComplete={complete} onDelete={remove} onEdit={openEdit} onOpen={openDetail} />
            ))}
          </div>
        )}
        {noDueCount > 0 && (
          <p className="tl-cal-note">期限のない未完了のタスクが {noDueCount} 件あります（リストで確認できます）。</p>
        )}
      </div>
    </div>
  )
}
