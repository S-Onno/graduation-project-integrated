'use client'

import { useState } from 'react'

// パスワードの入力欄(「表示」で入力した文字を確かめられる)
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
  maxLength,
  describedBy,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  placeholder?: string
  minLength?: number
  maxLength?: number
  describedBy?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="za-field">
      <input
        id={id}
        className="za-input"
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        minLength={minLength}
        maxLength={maxLength}
        aria-describedby={describedBy}
        required
      />
      <button
        type="button"
        className="za-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'パスワードを隠す' : 'パスワードを表示する'}
        aria-pressed={visible}
      >
        {visible ? '隠す' : '表示'}
      </button>
    </div>
  )
}
