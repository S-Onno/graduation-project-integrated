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
  const [loading, setLoading] = useState(false)

  // 選択した日付・時刻をISO文字列に変換する
  const buildDueDate = (): string => {
    if (!selectedDate) return ''
    const d = new Date(selectedDate)
    d.setHours(parseInt(selectedHour), parseInt(selectedMinute), 0, 0)
    return d.toISOString()
  }

  // 表示用のラベルを作成する
  const dueDateLabel = selectedDate
    ? `${format(selectedDate, 'yyyy年MM月dd日', { locale: ja })} ${selectedHour}:${selectedMinute}`
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
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>📋 新しいタスクを追加</h3>
        <form onSubmit={handleSubmit}>

          {/* タスク名 */}
          <div className="form-group">
            <label className="form-label">タスク名 *</label>
            <input
              className="form-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例: 数学の問題集を10問解く"
              autoFocus
            />
          </div>

          {/* メモ */}
          <div className="form-group">
            <label className="form-label">メモ（任意）</label>
            <textarea
              className="form-input"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="補足メモ"
              rows={3}
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* 期限日時 */}
          <div className="form-group">
            <label className="form-label">期限日時（任意）</label>

            {/* 日付選択ボタン */}
            <button
              type="button"
              className="form-input"
              style={{ textAlign: 'left', cursor: 'pointer', color: selectedDate ? 'var(--text-primary)' : 'var(--text-muted)' }}
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

            {/* 時刻選択（日付が選ばれたときだけ表示） */}
            {selectedDate && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>時刻：</span>
                <select
                  className="form-input"
                  style={{ width: 'auto' }}
                  value={selectedHour}
                  onChange={e => setSelectedHour(e.target.value)}
                >
                  {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                    <option key={h} value={h}>{h}時</option>
                  ))}
                </select>
                <select
                  className="form-input"
                  style={{ width: 'auto' }}
                  value={selectedMinute}
                  onChange={e => setSelectedMinute(e.target.value)}
                >
                  {['00', '15', '30', '45'].map(m => (
                    <option key={m} value={m}>{m}分</option>
                  ))}
                </select>
                {/* 日付クリアボタン */}
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                  onClick={() => setSelectedDate(undefined)}
                >
                  クリア
                </button>
              </div>
            )}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>キャンセル</button>
            <button type="submit" className="btn-primary" disabled={loading || !title.trim()}>
              {loading ? '追加中...' : '追加する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}