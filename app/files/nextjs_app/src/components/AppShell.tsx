'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

const TASK_NAV = [
  { href: '/tasks', label: 'タスク管理', icon: '📋' },
]
const ZOO_NAV = { href: '/zoo', label: '動物園', icon: '🦁' }
const NAV = [...TASK_NAV, ZOO_NAV]

export function AppShell({ children, fullBleed = false }: { children: React.ReactNode; fullBleed?: boolean }) {
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

        {/* タスク（作業）系のナビ */}
        <nav className="sidebar-nav">
          {TASK_NAV.map(item => (
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

        {/* ゲーム（動物園）系のナビ：視覚的に区切って、大きく目立たせる */}
        <div className="sidebar-zoo-section">
          <Link
            href={ZOO_NAV.href}
            className={`sidebar-zoo-btn${pathname.startsWith(ZOO_NAV.href) ? ' active' : ''}`}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="sidebar-zoo-icon">{ZOO_NAV.icon}</span>
            <span>{ZOO_NAV.label}</span>
          </Link>
        </div>

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
          {fullBleed ? children : <div className="page-inner">{children}</div>}
        </main>
      </div>
    </div>
  )
}
