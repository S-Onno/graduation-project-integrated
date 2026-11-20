import type { Metadata } from 'next'
import './globals.css'
import { SessionProvider } from '@/components/SessionProvider'

export const metadata: Metadata = {
  title: 'タスク×動物園育成アプリ',
  description: 'タスクを完了すると動物が育って動物園が広がるWebアプリ',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <SessionProvider>
          {children}
        </SessionProvider>
        {/* スマホを横にしたときだけ出す(縦向きだけに対応するため。CSS は globals.css) */}
        <div className="rotate-notice" role="alert">
          <span className="rotate-notice-icon">📱</span>
          <p>スマートフォンは縦向きでご利用ください</p>
        </div>
      </body>
    </html>
  )
}
