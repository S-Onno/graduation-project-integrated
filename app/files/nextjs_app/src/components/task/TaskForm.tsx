'use client'

import * as React from 'react'
import { useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

type PriorityValue = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'

const PRIORITY_OPTIONS: { value: PriorityValue; label: string; color: string; bg: string }[] = [
  { value: 'NONE', label: 'なし', color: '#9ca3af', bg: '#f3f4f6' },
  { value: 'HIGH', label: '高', color: '#dc2626', bg: '#fef2f2' },
  { value: 'MEDIUM', label: '中', color: '#d97706', bg: '#fffbeb' },
  { value: 'LOW', label: '低', color: '#2563eb', bg: '#eff6ff' },
]

export interface EditingTask {
  id: string
  title: string
  description?: string | null
  due_date?: string | null
  priority: PriorityValue
}

interface Props {
  // 追加モード
  onAdd?: (title: string, description: string, dueDate: string, priority: PriorityValue) => Promise<void>
  // 編集モード
  onEdit?: (title: string, description: string, dueDate: string, priority: PriorityValue) => Promise<void>
  // 編集対象タスク（編集モード時に渡す）
  editingTask?: EditingTask
  onClose: () => void
}

export function TaskForm({ onAdd, onEdit, editingTask, onClose }: Props) {
  const isEditing = !!editingTask

  const initialDate = editingTask?.due_date ? new Date(editingTask.due_date) : undefined
  const initialIsAllDay = !!editingTask?.due_date &&
    initialDate!.getHours() === 23 && initialDate!.getMinutes() === 59 && initialDate!.getSeconds() === 59

  const [title, setTitle] = useState(editingTask?.title ?? '')
  const [description, setDescription] = useState(editingTask?.description ?? '')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate)
  const [selectedHour, setSelectedHour] = useState(initialIsAllDay || !initialDate ? '23' : String(initialDate.getHours()).padStart(2, '0'))
  const [selectedMinute, setSelectedMinute] = useState(initialIsAllDay || !initialDate ? '59' : String(initialDate.getMinutes()).padStart(2, '0'))
  const [showCalendar, setShowCalendar] = useState(false)
  const [isAllDay, setIsAllDay] = useState(initialIsAllDay)
  const [priority, setPriority] = useState<PriorityValue>(editingTask?.priority ?? 'NONE')
  const [loading, setLoading] = useState(false)

  const buildDueDate = (): string => {
    if (!selectedDate) return ''
    const d = new Date(selectedDate)
    if (isAllDay) {
      d.setHours(23, 59, 59, 0)
    } else {
      d.setHours(parseInt(selectedHour), parseInt(selectedMinute), 0, 0)
    }
    return d.toISOString()
  }

  const dueDateLabel = selectedDate
    ? isAllDay
      ? `${format(selectedDate, 'yyyy年MM月dd日', { locale: ja })}（終日）`
      : `${format(selectedDate, 'yyyy年MM月dd日', { locale: ja })} ${selectedHour}:${selectedMinute}`
    : ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    if (isEditing) {
      await onEdit?.(title.trim(), description.trim(), buildDueDate(), priority)
    } else {
      await onAdd?.(title.trim(), description.trim(), buildDueDate(), priority)
      setTitle('')
      setDescription('')
      setSelectedDate(undefined)
      setSelectedHour('23')
      setSelectedMinute('59')
      setIsAllDay(false)
      setPriority('NONE')
    }
    setLoading(false)
    onClose()
  }

  return (
    <div className="tl-modal-overlay" onClick={onClose}>
      <div className="tl-modal" onClick={e => e.stopPropagation()}>
        <h3>{isEditing ? '✏️ タスクを編集' : '📋 新しいタスクを追加'}</h3>
        <form onSubmit={handleSubmit}>

          {/* タスク名 */}
          <div className="tl-group">
            <label className="tl-label">タスク名 *</label>
            <input
              className="tl-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例: 数学の問題集を10問解く"
              autoFocus
            />
          </div>

          {/* メモ */}
          <div className="tl-group">
            <label className="tl-label">メモ（任意）</label>
            <textarea
              className="tl-input"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="補足メモ"
              rows={3}
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* 優先順位 */}
          <div className="tl-group">
            <label className="tl-label">優先順位（任意）</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {PRIORITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`tl-priority-btn${priority === opt.value ? ' active' : ''}`}
                  style={{
                    color: opt.color,
                    background: priority === opt.value ? opt.bg : 'transparent',
                    borderColor: priority === opt.value ? opt.color : 'var(--zoo-border)',
                  }}
                  onClick={() => setPriority(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 期限日時 */}
          <div className="tl-group">
            <label className="tl-label">期限日時（任意）</label>

            {/* 日付選択ボタン */}
            <button
              type="button"
              className="tl-input"
              style={{ textAlign: 'left', cursor: 'pointer', color: selectedDate ? 'var(--zoo-text)' : 'var(--zoo-text-muted)' }}
              onClick={() => setShowCalendar(prev => !prev)}
            >
              {dueDateLabel || '📅 日付を選択'}
            </button>

            {/* カレンダー表示 */}
            {showCalendar && (
              <div style={{ marginTop: '8px' }}>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date)
                    setShowCalendar(false)
                  }}
                  disabled={{ before: new Date() }}
                />
              </div>
            )}

            {/* 日付が選ばれたときだけ表示 */}
            {selectedDate && (
              <>
                {/* 終日チェックボックス */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                  <input
                    type="checkbox"
                    id="isAllDay"
                    checked={isAllDay}
                    onChange={e => setIsAllDay(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--zoo-purple)' }}
                  />
                  <label
                    htmlFor="isAllDay"
                    style={{ fontSize: '13px', color: 'var(--zoo-text-sub)', cursor: 'pointer' }}
                  >
                    終日
                  </label>
                </div>

                {/* 時刻選択（終日オフのときだけ表示） */}
                {!isAllDay && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--zoo-text-sub)' }}>時刻：</span>
                    <select
                      className="tl-input"
                      style={{ width: 'auto' }}
                      value={selectedHour}
                      onChange={e => setSelectedHour(e.target.value)}
                    >
                      {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                        <option key={h} value={h}>{h}時</option>
                      ))}
                    </select>
                    <select
                      className="tl-input"
                      style={{ width: 'auto' }}
                      value={selectedMinute}
                      onChange={e => setSelectedMinute(e.target.value)}
                    >
                      {['00', '15', '30', '45'].map(m => (
                        <option key={m} value={m}>{m}分</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* クリアボタン */}
                <div style={{ marginTop: '8px' }}>
                  <button
                    type="button"
                    className="tl-btn-ghost"
                    style={{ fontSize: '12px', padding: '4px 8px' }}
                    onClick={() => {
                      setSelectedDate(undefined)
                      setIsAllDay(false)
                    }}
                  >
                    クリア
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="tl-modal-actions">
            <button type="button" className="tl-btn-ghost" onClick={onClose}>キャンセル</button>
            <button type="submit" className="tl-btn-primary" disabled={loading || !title.trim()}>
              {loading ? (isEditing ? '保存中...' : '追加中...') : (isEditing ? '保存する' : '追加する')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
