'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { TasksProvider, useTasksContext } from '@/components/task/TasksContext'
import { IkuseiView } from '@/components/zoo/IkuseiView'
import type { IkuseiHandle } from '@/components/zoo/IkuseiView'
import { Icon } from '@/components/ui/Icon'

/* ============================================================
 * タスク画面の共通部分
 *
 * 見出し・追加ボタン・ビューの切り替え・育成パネルを、各ビュー(一覧など)で共有する。
 * ビューを切り替えても、タスクの一覧や育成パネルは読み直さない。
 * スマホ: 追加は右下のボタン、育成パネルは右端のつまみから引き出す(横に並ばない幅のとき)。
 * ============================================================ */

// タスク画面のビュー。カレンダーやマトリクスを作ったら、ここに足す
const TASK_VIEWS = [
  { href: '/tasks', label: 'リスト' },
  { href: '/tasks/calendar', label: 'カレンダー' },
  { href: '/tasks/matrix', label: 'マトリクス' },
]

// 見出し(PC のみ。スマホでは上部バーに任せる)
function TasksHeader() {
  const { openAdd } = useTasksContext()
  const [today] = useState(() => new Date())
  return (
    <div className="tl-header">
      <div>
        <p className="tl-subtitle">{format(today, 'yyyy年M月d日（E）', { locale: ja })}</p>
        <h2 className="tl-title">今日の飼育メモ</h2>
      </div>
      <button className="tl-add-btn" onClick={() => openAdd()}>
        <Icon name="plus" size={16} />
        タスクを追加
      </button>
    </div>
  )
}

// スマホの右下に出す追加ボタン
function AddTaskFab() {
  const { openAdd } = useTasksContext()
  return (
    <button className="tl-fab" onClick={() => openAdd()} aria-label="タスクを追加">
      <Icon name="plus" size={26} />
    </button>
  )
}

// タスクの検索(タイトルとメモ)。サイドバーのタスクの並びの一番下に置き、どのビューでも同じ検索が効く。
// Enter を押すと、スマホで開いたサイドバーを閉じて結果を見せる
function TaskSearch({ onSubmit }: { onSubmit: () => void }) {
  const { query, setQuery, tasks, visibleTasks } = useTasksContext()
  const searching = query.trim().length > 0
  return (
    <div className="tl-search">
      <div className="tl-search-box">
        <span className="tl-search-icon" aria-hidden="true">
          <Icon name="search" size={15} />
        </span>
        <input
          type="search"
          className="tl-search-input"
          placeholder="タスクを検索"
          aria-label="タスクを検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('')
            if (e.key === 'Enter') {
              e.currentTarget.blur()
              onSubmit()
            }
          }}
        />
        {query && (
          <button className="tl-search-clear" onClick={() => setQuery('')} aria-label="検索を消す">
            ×
          </button>
        )}
      </div>
      {searching && (
        <p className="tl-search-result" aria-live="polite">
          {visibleTasks.length} 件 / 全 {tasks.length} 件
        </p>
      )}
    </div>
  )
}

// 検索中だけ、一覧の上に絞り込みの状態を出す(スマホでサイドバーを閉じても分かるように)
function TaskSearchStatus() {
  const { query, setQuery, tasks, visibleTasks } = useTasksContext()
  const words = query.trim()
  if (!words) return null
  return (
    <div className="tl-search-status" aria-live="polite">
      <span>
        「{words}」で絞り込み中　{visibleTasks.length} 件 / 全 {tasks.length} 件
      </span>
      <button className="tl-search-status-clear" onClick={() => setQuery('')}>
        解除
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
  const [gameOpen, setGameOpen] = useState(false) // 育成パネルを右から引き出しているか(スマホ・タブレット)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  // 引き出しているときは、Esc で閉じる
  useEffect(() => {
    if (!gameOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGameOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [gameOpen])

  if (status === 'loading') return null

  return (
    <TasksProvider enabled={!!session} onCompleted={() => ikuseiRef.current?.reload()}>
      <AppShell fullBleed taskNavFooter={(closeSidebar) => <TaskSearch onSubmit={closeSidebar} />}>
        <div className="tl-page">
          {/* タスクエリア:ゲームパネル＝約6:4 (col-span-7:col-span-5) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">
            {/* 左側：タスクパネル (.task-panel) - 約60%の幅 (7/12) */}
            <div className="task-panel lg:col-span-7">
              <div className="tl-inner">
                <TasksHeader />
                <TaskSearchStatus />
                <TaskViewTabs />
                {children}
              </div>
            </div>

            {/* 右側：ゲームパネル (.game-panel) - 約40% (5/12)。
                横に並ばない幅では、右から引き出すパネルになる(常に表示したままにして、育成の状態を保つ) */}
            <div
              className={`tl-game lg:col-span-5 lg:sticky lg:top-6 w-full${gameOpen ? ' open' : ''}`}
              aria-label="育成中の動物"
            >
              <IkuseiView ref={ikuseiRef} isEmbedded={true} />
            </div>
          </div>
        </div>

        <AddTaskFab />
        {/* つまみ。閉じているときは画面の右端に「育成中」、開いているときはパネルの左端に「閉じる」。
            パネルと一緒に動く */}
        <button
          className={`tl-game-handle${gameOpen ? ' open' : ''}`}
          onClick={() => setGameOpen((open) => !open)}
          aria-label={gameOpen ? '育成中の動物を閉じる' : '育成中の動物を開く'}
          aria-expanded={gameOpen}
        >
          <Icon name={gameOpen ? 'close' : 'zoo'} size={18} />
          {gameOpen ? '閉じる' : '育成中'}
        </button>
        {gameOpen && <div className="tl-game-backdrop" onClick={() => setGameOpen(false)} />}
      </AppShell>
    </TasksProvider>
  )
}
