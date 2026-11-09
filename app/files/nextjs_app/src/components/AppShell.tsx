'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Icon } from '@/components/ui/Icon'
import type { IconName } from '@/components/ui/Icon'

interface NavItem {
  href: string
  label: string // サイドバーと上部バーの名前
  short: string // スマホの下のタブバーの名前
  icon: IconName
}

const TASK_NAV: NavItem[] = [
  { href: '/tasks', label: 'タスク管理', short: 'リスト', icon: 'list' },
  { href: '/tasks/calendar', label: 'カレンダー', short: 'カレンダー', icon: 'calendar' },
  { href: '/tasks/matrix', label: 'マトリクス', short: 'マトリクス', icon: 'matrix' },
]
const ZOO_NAV: NavItem = { href: '/zoo/map', label: '動物園', short: '動物園', icon: 'zoo' }
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
          <span className="sidebar-zoo-icon"><Icon name="zoo" size={22} /></span>
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
              <Icon name={item.icon} />
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
            <span className="sidebar-zoo-icon"><Icon name={ZOO_NAV.icon} size={22} /></span>
            <span>{ZOO_NAV.label}</span>
          </Link>
        </div>

        <div style={{ padding: '16px', borderTop: '1px solid var(--zoo-border)' }}>
          <button className="btn-ghost sidebar-logout" style={{ width: '100%' }} onClick={() => signOut({ callbackUrl: '/login' })}>
            ログアウト
          </button>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <div className="main-content">
        <header className="topbar">
          <button className="topbar-menu" onClick={() => setSidebarOpen(true)} aria-label="メニューを開く">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <h1 className="topbar-title">
            {NAV.find(n => n.href === currentHref)?.label ?? 'ZooTask'}
          </h1>
        </header>

        <main className="page-container">
          {fullBleed ? children : <div className="page-inner">{children}</div>}
        </main>
      </div>

      {/* スマホの下のタブバー(PC では出さない) */}
      <nav className="tabbar" aria-label="画面の切り替え">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`tabbar-item${currentHref === item.href ? ' active' : ''}`}
            aria-current={currentHref === item.href ? 'page' : undefined}
          >
            <Icon name={item.icon} size={22} />
            <span>{item.short}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
