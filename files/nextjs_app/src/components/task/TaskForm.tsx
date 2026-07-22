'use client'

import { useState } from 'react'

interface Props {
  onAdd: (title: string, description: string, dueDate: string) => Promise<void>
  onClose: () => void
}

export function TaskForm({ onAdd, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [dueDate, setDueDate] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    await onAdd(title.trim(), description.trim(), dueDate)
    setLoading(false)
    setTitle('')
    setDescription('')
    setDueDate('')   // ← この行を追加
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>📋 新しいタスクを追加</h3>
        <form onSubmit={handleSubmit}>
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
          <div className="form-group">
            <label className="form-label">期限日時（任意）</label>
            <input
              type="datetime-local"
              className="form-input"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </div>
          <div className="modal-actions">
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
