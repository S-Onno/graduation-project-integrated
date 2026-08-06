'use client'

import * as React from 'react'
import { useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

interface Props {
  onAdd: (title: string, description: string, dueDate: string) => Promise<void>
  onClose: () => void
}

export function TaskForm({ onAdd, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [selectedHour, setSelectedHour] = useState('23')
  const [selectedMinute, setSelectedMinute] = useState('59')
  const [showCalendar, setShowCalendar] = useState(false)
  const [isAllDay, setIsAllDay] = useState(false)
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
    await onAdd(title.trim(), description.trim(), buildDueDate())
    setLoading(false)
    setTitle('')
    setDescription('')
    setSelectedDate(undefined)
    setSelectedHour('23')
    setSelectedMinute('59')
    setIsAllDay(false)
    onClose()
  }

  return (
    <div className="tl-modal-overlay" onClick={onClose}>
      <div className="tl-modal" onClick={e => e.stopPropagation()}>
        <h3>📋 新しいタスクを追加</h3>
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
              {loading ? '追加中...' : '追加する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
