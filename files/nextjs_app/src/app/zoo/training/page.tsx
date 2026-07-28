'use client'

import { useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import { useSession } from 'next-auth/react'

const STAGE_LABEL: Record<string, string> = { BABY: '赤ちゃん 🐣', CHILD: '子供 🐥', ADULT: '大人 🦁' }
const STAGE_MAX: Record<string, number> = { BABY: 4, CHILD: 9, ADULT: 9 }

const ANIMAL_EMOJI: Record<string, string> = {
  ゴリラ: '🦍', オウム: '🦜', サル: '🐒',
  ライオン: '🦁', ゾウ: '🐘', キリン: '🦒',
  シロクマ: '🐻‍❄️', ペンギン: '🐧', アザラシ: '🦭',
  カバ: '🦛', ワニ: '🐊', フラミンゴ: '🦩',
}

interface UserAnimal {
  id: string
  stage: string
  task_count: number
  is_placed: boolean
  animal: { name: string; area_type: string; area: { name: string } }
}

export interface IkuseiHandle {
  reload: () => void
}

interface IkuseiViewProps {
  isEmbedded?: boolean
}

// 動物イラストを表示するスロット。
// 今はプレースホルダー(黒枠)だが、imageSrcを渡すだけで
// 実際のイラストに差し替えられるようにしてある。
function AnimalDisplaySlot({ imageSrc }: { imageSrc?: string }) {
  return (
    <div
      className="absolute rounded-lg flex items-center justify-center overflow-hidden"
      style={{
        width: '40%',
        aspectRatio: '1 / 1',
        top: '55%',
        left: '50%',
        transform: 'translate(-50%, -50%)', // 中心を基準位置(縦30%・横50%)に合わせる
        border: imageSrc ? 'none' : '4px dashed #000000',
        backgroundColor: imageSrc ? 'transparent' : 'rgba(0, 0, 0, 0.15)',
      }}
    >
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt="育成中の動物イラスト"
          className="w-full h-full object-contain"
        />
      ) : (
        <span className="text-black/70 text-xs font-bold">動物イラスト配置枠</span>
      )}
    </div>
  )
}

export const IkuseiView = forwardRef<IkuseiHandle, IkuseiViewProps>((props, ref) => {
  const { data: session } = useSession()
  const [animals, setAnimals] = useState<UserAnimal[]>([])
  const [placingId, setPlacingId] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const fetchAnimals = useCallback(async () => {
    const res = await fetch('/api/user-animals')
    if (res.ok) setAnimals(await res.json())
  }, [])

  useImperativeHandle(ref, () => ({
    reload: () => {
      fetchAnimals()
    }
  }))

  useEffect(() => {
    if (session) fetchAnimals()
  }, [session, fetchAnimals])

  const handlePlace = async (userAnimalId: string, area_type: string) => {
    const res = await fetch('/api/zoo/place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAnimalId,
        area_type,
        pos_x: 100 + Math.random() * 200,
        pos_y: 100 + Math.random() * 200
      }),
    })
    if (res.ok) {
      setToast('🦁 動物園に配置しました！')
      setTimeout(() => setToast(''), 3000)
      fetchAnimals()
    }
    setPlacingId(null)
  }

  const growing = animals.filter(a => a.stage !== 'ADULT')

  return (
    <div
      className="game-panel w-full min-h-[600px] h-full p-5 rounded-2xl shadow-2xl relative overflow-y-auto flex flex-col gap-4 select-none"
      style={{
        background: `linear-gradient(
          to bottom,
          #7ec8e3 0%,
          #bae6fd 25%,
          #a3e635 25%,
          #4d7c0f 100%
        )`,
      }}
    >
      <div className="info-panel w-full bg-slate-900/90 backdrop-blur-md text-white p-5 rounded-2xl border-2 border-slate-700/80 shadow-2xl space-y-5">
        <div>
          <h2 className="text-lg font-black tracking-wide text-amber-300 flex items-center gap-2">
            🐣 育成中の動物
          </h2>
        </div>

        {growing.length > 0 && (
          <div className="space-y-3">
            {growing.map(a => {
              const progress = (a.task_count / STAGE_MAX[a.stage]) * 100
              return (
                <div key={a.id} className="bg-slate-800/90 p-3 rounded-xl border border-slate-700 space-y-2 shadow-inner">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{ANIMAL_EMOJI[a.animal.name] ?? '🐾'}</span>
                      <div>
                        <p className="text-sm font-bold text-slate-100">{a.animal.name}</p>
                        <p className="text-[11px] text-slate-400">{STAGE_LABEL[a.stage]} ({a.animal.area.name})</p>
                      </div>
                    </div>
                  </div>

                  <div className="w-full bg-slate-700 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-400 h-full transition-all duration-500 shadow-sm"
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-right text-slate-400 font-mono">
                    {a.task_count} / {STAGE_MAX[a.stage]} タスク
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 芝生エリア：動物イラストを表示する領域全体(相対位置の基準) */}
      <div className="flex-1 relative">
        <AnimalDisplaySlot />
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 bg-emerald-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-2xl z-50">
          {toast}
        </div>
      )}
    </div>
  )
})

IkuseiView.displayName = 'IkuseiView'

export default function IkuseiPage() {
  return (
    <div className="p-6 h-screen bg-slate-950">
      <IkuseiView />
    </div>
  )
}