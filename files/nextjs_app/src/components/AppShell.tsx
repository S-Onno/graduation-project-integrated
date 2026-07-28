'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

const NAV = [
  { href: '/tasks',      label: 'タスク管理',    icon: '📋' },
  { href: '/zoo',        label: '動物園',        icon: '🦁' },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  return (
    <div className="app-shell">
      {/* モバイル用オーバーレイ */}
      {sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* サイドバー */}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-logo">🦁</span>
          <span className="sidebar-title">ZooTask</span>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${pathname.startsWith(item.href) ? ' active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
          <button className="btn-ghost" style={{ width: '100%' }} onClick={() => signOut({ callbackUrl: '/login' })}>
            ログアウト
          </button>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <div className="main-content">
        <header className="topbar">
          <button className="topbar-menu" onClick={() => setSidebarOpen(true)}>☰</button>
          <h1 className="topbar-title">
            {NAV.find(n => pathname.startsWith(n.href))?.label ?? 'ZooTask'}
          </h1>
        </header>

        <main className="page-container">
          <div className="page-inner">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
