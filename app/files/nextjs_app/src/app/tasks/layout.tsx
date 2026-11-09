'use client'

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { TasksProvider, useTasksContext } from '@/components/task/TasksContext'
import { IkuseiView, IkuseiHandle } from '@/app/zoo/training/page'

/* ============================================================
 * タスク画面の共通部分
 *
 * 見出し・追加ボタン・ビューの切り替え・育成パネルを、各ビュー(一覧など)で共有する。
 * ビューを切り替えても、タスクの一覧や育成パネルは読み直さない。
 * ============================================================ */

// タスク画面のビュー。カレンダーやマトリクスを作ったら、ここに足す
const TASK_VIEWS = [{ href: '/tasks', label: 'リスト' }]

function TasksHeader() {
  const { openAdd } = useTasksContext()
  return (
    <div className="tl-header">
      <div>
        <h2 className="tl-title">タスク管理</h2>
        <p className="tl-subtitle">タスクを完了すると動物が育ちます 🐾</p>
      </div>
      <button className="tl-add-btn" onClick={openAdd}>
        ＋ タスクを追加
      </button>
    </div>
  )
}

// ビューの切り替え。ビューが1つのうちは表示しない
function TaskViewTabs() {
  const pathname = usePathname()
  if (TASK_VIEWS.length < 2) return null
  return (
    <nav className="tl-view-tabs">
      {TASK_VIEWS.map((view) => (
        <Link
          key={view.href}
          href={view.href}
          className={`tl-view-tab${pathname === view.href ? ' active' : ''}`}
        >
          {view.label}
        </Link>
      ))}
    </nav>
  )
}

export default function TasksLayout({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const ikuseiRef = useRef<IkuseiHandle>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  if (status === 'loading') return null

  return (
    <AppShell fullBleed>
      <TasksProvider enabled={!!session} onCompleted={() => ikuseiRef.current?.reload()}>
        <div className="tl-page">
          {/* タスクエリア:ゲームパネル＝約6:4 (col-span-7:col-span-5) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">
            {/* 左側：タスクパネル (.task-panel) - 約60%の幅 (7/12) */}
            <div className="task-panel lg:col-span-7">
              <div className="tl-inner">
                <TasksHeader />
                <TaskViewTabs />
                {children}
              </div>
            </div>

            {/* 右側：ゲームパネル (.game-panel) - 約40% (5/12) */}
            <div className="lg:col-span-5 lg:sticky lg:top-6 w-full">
              <IkuseiView ref={ikuseiRef} isEmbedded={true} />
            </div>
          </div>
        </div>
      </TasksProvider>
    </AppShell>
  )
}
