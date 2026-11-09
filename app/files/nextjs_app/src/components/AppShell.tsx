'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

const TASK_NAV = [
  { href: '/tasks', label: 'タスク管理', icon: '📋' },
  { href: '/tasks/calendar', label: 'カレンダー', icon: '📅' },
]
const ZOO_NAV = { href: '/zoo/map', label: '動物園', icon: '🦁' }
const NAV = [...TASK_NAV, ZOO_NAV]

// いまの URL に、いちばん詳しく一致するナビの項目
// (/tasks/calendar を開いているときに「タスク管理」まで選択中にしないため)
function currentNavHref(pathname: string): string | undefined {
  return NAV.map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0]
}

export function AppShell({
  children,
  fullBleed = false,
  taskNavFooter,
}: {
  children: React.ReactNode
  fullBleed?: boolean
  // サイドバーのタスクの並びの一番下に置く部品(タスク画面の検索など)。
  // 引数の関数を呼ぶと、スマホで開いたサイドバーを閉じる
  taskNavFooter?: (closeSidebar: () => void) => ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const currentHref = currentNavHref(pathname)

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
              className={`nav-item${currentHref === item.href ? ' active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
          {taskNavFooter && (
            <div className="sidebar-nav-footer">{taskNavFooter(() => setSidebarOpen(false))}</div>
          )}
        </nav>

        {/* ゲーム（動物園）系のナビ：視覚的に区切って、大きく目立たせる */}
        <div className="sidebar-zoo-section">
          <Link
            href={ZOO_NAV.href}
            className={`sidebar-zoo-btn${currentHref === ZOO_NAV.href ? ' active' : ''}`}
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
            {NAV.find(n => n.href === currentHref)?.label ?? 'ZooTask'}
          </h1>
        </header>

        <main className="page-container">
          {fullBleed ? children : <div className="page-inner">{children}</div>}
        </main>
      </div>
    </div>
  )
}
