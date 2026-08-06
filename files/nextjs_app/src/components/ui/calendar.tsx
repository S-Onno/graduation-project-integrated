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
        '--rdp-background-color': '#eef2ff',
        '--rdp-accent-color-dark': '#4f46e5',
        '--rdp-background-color-dark': '#eef2ff',
        color: '#1f2937',
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '12px',
      } as React.CSSProperties}
    />
  )
}

// ja                   ← 日本語カレンダー（月・曜日が日本語になる）
// --rdp-accent-color   ← 選択日の色をタスク画面の紫（#6366f1）に合わせる
// --rdp-background     ← タスク画面のライトテーマに合わせる
// color / backgroundColor ← タスク画面の文字色・背景色に合わせる