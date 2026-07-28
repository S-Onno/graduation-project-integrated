'use client'

import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import { ja } from 'date-fns/locale'
import 'react-day-picker/dist/style.css'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

export function Calendar({
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={ja}
      {...props}
      style={{
        '--rdp-accent-color': '#6366f1',
        '--rdp-background-color': '#252545',
        '--rdp-accent-color-dark': '#818cf8',
        '--rdp-background-color-dark': '#252545',
        color: '#f1f5f9',
        backgroundColor: '#1e1e36',
        borderRadius: '12px',
        padding: '12px',
      } as React.CSSProperties}
    />
  )
}

// ja                   ← 日本語カレンダー（月・曜日が日本語になる）
// --rdp-accent-color   ← 選択日の色を既存の紫（#6366f1）に合わせる
// --rdp-background     ← 既存のダークテーマに合わせる
// color / backgroundColor ← 既存の文字色・背景色に合わせる