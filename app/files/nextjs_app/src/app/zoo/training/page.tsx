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

// 動物種類 × 育成段階(赤ちゃん→子供→大人)ごとのイラストパス一覧
// index: 0=シロクマ, 1=ペンギン, 2=アザラシ
const ANIMAL_STAGE_IMAGES: string[][] = [
  [
    '/assets/animals/snow/shirokuma_baby.png',
    '/assets/animals/snow/shirokuma_child.png',
    '/assets/animals/snow/shirokuma_adult.png',
  ],
  [
    '/assets/animals/snow/penguin_baby.png',
    '/assets/animals/snow/penguin_child.png',
    '/assets/animals/snow/penguin_adult.png',
  ],
  [
    '/assets/animals/snow/azarashi_baby.png',
    '/assets/animals/snow/azarashi_child.png',
    '/assets/animals/snow/azarashi_adult.png',
  ],
]

// ANIMAL_STAGE_IMAGES と同じ並び順の動物名(アイコン・ラベル表示用)
const SPECIES_NAMES: string[] = ['シロクマ', 'ペンギン', 'アザラシ']

// タスク完了数(育成カウンター)から成長段階を判定
type GrowthStage = 'NONE' | 'BABY' | 'CHILD' | 'ADULT'

function getGrowthStage(count: number): GrowthStage {
  if (count <= 0) return 'NONE'
  if (count <= 3) return 'BABY'
  if (count <= 6) return 'CHILD'
  return 'ADULT' // 7以上はずっと大人のまま
}

const STAGE_TO_IMAGE_COLUMN: Record<'BABY' | 'CHILD' | 'ADULT', number> = {
  BABY: 0,
  CHILD: 1,
  ADULT: 2,
}

function AnimalDisplaySlot({ imageSrc }: { imageSrc?: string }) {
  return (
    <div
      className="absolute rounded-lg flex items-center justify-center overflow-hidden"
      style={{
        width: '40%',
        aspectRatio: '1 / 1',
        top: '55%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
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

// タスク完了数が0の時に表示する看板(背後に「?」シルエットの動物が動きながら表示)
function SignBoard({ text }: { text: string }) {
  return (
    <>
      {/* ▼ シルエットの移動アニメーション(位置：25秒周期でループ) と 揺れアニメーション(傾き：1.4秒周期でループ) */}
      <style jsx global>{`
        @keyframes mysterySilhouetteMove {
          0%   { top: 55%; left: 50%; } /* 0. 初期位置 */
          20%  { top: 20%; left: 25%; } /* 1. 左上へ(0→1: 5秒) */
          32%  { top: 20%; left: 75%; } /* 2. 右へ(1→2: 3秒) */
          44%  { top: 55%; left: 50%; } /* 3. 初期位置に戻る(2→3: 3秒) */
          56%  { top: 70%; left: 25%; } /* 4. 左下へ(3→4: 3秒) */
          68%  { top: 70%; left: 75%; } /* 5. 右へ(4→5: 3秒) */
          80%  { top: 55%; left: 50%; } /* 6. 初期位置に戻る(5→6: 3秒) */
          100% { top: 55%; left: 50%; } /* 6→0: 5秒かけて次のループへ */
        }

        @keyframes mysterySilhouetteSway {
          0%   { transform: rotate(-8deg); }
          50%  { transform: rotate(8deg); }
          100% { transform: rotate(-8deg); }
        }
      `}</style>

      {/* ▼ 位置移動を担当する外側のラッパー(見た目には何も表示しない、位置だけ動く) */}
      <div
        className="absolute flex items-center justify-center"
        style={{
          width: '45%',
          aspectRatio: '1 / 1',
          transform: 'translate(-50%, -50%)',
          zIndex: 10,
          animation: 'mysterySilhouetteMove 25s ease-in-out infinite',
        }}
      >
        {/* ▼ 左右の揺れ(メトロノーム動作)を担当する内側のラッパー */}
        <div
          className="w-full h-full flex items-center justify-center"
          style={{
            transformOrigin: 'bottom center', // 足元を軸にして揺れる
            animation: 'mysterySilhouetteSway 1.4s ease-in-out infinite',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/ui/mystery_animal.png"
            alt="謎の動物シルエット"
            className="w-full h-full object-contain opacity-70"
          />
        </div>
      </div>

      {/* ▼ 看板本体(位置は固定のまま、シルエットの手前・上に重ねる) */}
      <div
        className="absolute rounded-lg flex items-center justify-center px-4 py-4 shadow-lg text-center"
        style={{
          width: '55%',
          top: '55%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: '#8b5e34',
          border: '4px solid #5c3d1f',
          zIndex: 20,
        }}
      >
        <span className="text-white text-sm font-bold leading-relaxed">{text}</span>
      </div>
    </>
  )
}

export const IkuseiView = forwardRef<IkuseiHandle, IkuseiViewProps>(function IkuseiView(props, ref) {
  const { data: session } = useSession()
  const [animals, setAnimals] = useState<UserAnimal[]>([])
  const [placingId, setPlacingId] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  // ▼ 育成カウンター：タスク完了のたびに1増える。動物リセットボタンで0に戻せる。
  const [growthCount, setGrowthCount] = useState<number>(0)
  // ▼ 赤ちゃんが決まった時にランダムで選ばれる動物種(0=シロクマ,1=ペンギン,2=アザラシ)
  const [speciesIndex, setSpeciesIndex] = useState<number | null>(null)

  const stage = getGrowthStage(growthCount)

  // タスク完了数が0→1以上になったタイミングで、ランダムに動物種を1つ決定する
  useEffect(() => {
    if (stage === 'NONE') {
      if (speciesIndex !== null) {
        setSpeciesIndex(null)
      }
      return
    }
    if (speciesIndex === null) {
      setSpeciesIndex(Math.floor(Math.random() * ANIMAL_STAGE_IMAGES.length))
    }
  }, [stage, speciesIndex])

  const fetchAnimals = useCallback(async () => {
    const res = await fetch('/api/user-animals')
    if (res.ok) {
      const data = await res.json()
      setAnimals(data)
    }
  }, [])

  useImperativeHandle(ref, () => ({
    reload: () => {
      fetchAnimals()
      setGrowthCount((prev) => prev + 1)
    },
  }))

  useEffect(() => {
    if (session) {
      fetchAnimals()
    }
  }, [session, fetchAnimals])

  const handlePlace = async (userAnimalId: string, area_type: string) => {
    const res = await fetch('/api/zoo/place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAnimalId,
        area_type,
        pos_x: 100 + Math.random() * 200,
        pos_y: 100 + Math.random() * 200,
      }),
    })
    if (res.ok) {
      setToast('🦁 動物園に配置しました！')
      setTimeout(() => setToast(''), 3000)
      fetchAnimals()
    }
    setPlacingId(null)
  }

  const handleResetGrowth = () => {
    setGrowthCount(0)
    setSpeciesIndex(null)
  }

  const growing = animals.filter((a) => a.stage !== 'ADULT')
  const gaugePercent = Math.min((growthCount / 9) * 100, 100)

  let currentImageSrc: string | undefined = undefined
  if (stage !== 'NONE' && speciesIndex !== null) {
    const column = STAGE_TO_IMAGE_COLUMN[stage]
    currentImageSrc = ANIMAL_STAGE_IMAGES[speciesIndex][column]
  }

  return (
    <div
      className="game-panel w-full min-h-[600px] h-full p-5 rounded-2xl shadow-2xl relative overflow-y-auto flex flex-col gap-4 select-none"
      style={{
        background:
          'linear-gradient(to bottom, #7ec8e3 0%, #bae6fd 25%, #a3e635 25%, #4d7c0f 100%)',
      }}
    >
      <div className="info-panel w-full bg-slate-900/90 backdrop-blur-md text-white p-5 rounded-2xl border-2 border-slate-700/80 shadow-2xl space-y-5">
        <div>
          <h2 className="text-lg font-black tracking-wide text-amber-300 flex items-center gap-2">
            🐣 育成中の動物
          </h2>

          {/* ▼ 成長段階ゲージ：下の育成中リストのカードと同じデザイン */}
          {stage !== 'NONE' && speciesIndex !== null && (
            <div className="mt-3 bg-slate-800/90 p-3 rounded-xl border border-slate-700 space-y-2 shadow-inner">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">
                    {ANIMAL_EMOJI[SPECIES_NAMES[speciesIndex]] ?? '🐾'}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-100">
                      {SPECIES_NAMES[speciesIndex]}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {STAGE_LABEL[stage]} (雪)
                    </p>
                  </div>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {Math.min(growthCount, 9)} / 9 タスク
                </span>
              </div>

              <div className="w-full bg-slate-700 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-400 h-full transition-all duration-500 shadow-sm"
                  style={{ width: `${gaugePercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {growing.length > 0 && (
          <div className="space-y-3">
            {growing.map((a) => {
              const progress = (a.task_count / STAGE_MAX[a.stage]) * 100
              return (
                <div
                  key={a.id}
                  className="bg-slate-800/90 p-3 rounded-xl border border-slate-700 space-y-2 shadow-inner"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">
                        {ANIMAL_EMOJI[a.animal.name] ?? '🐾'}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-slate-100">
                          {a.animal.name}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {STAGE_LABEL[a.stage]} ({a.animal.area.name})
                        </p>
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

      {/* 芝生エリア：動物イラスト or 看板を表示する領域全体(相対位置の基準) */}
      <div className="flex-1 relative">
        {stage === 'NONE' ? (
          <SignBoard text="タスクを進めてください" />
        ) : (
          <AnimalDisplaySlot imageSrc={currentImageSrc} />
        )}

        {/* ▼ テスト用ボタン(あとで削除予定) */}
        <div className="absolute bottom-2 right-2 flex gap-1.5 z-40">
          <button
            onClick={() =>
              setSpeciesIndex((prev) => ((prev ?? -1) + 1) % ANIMAL_STAGE_IMAGES.length)
            }
            className="bg-slate-800/90 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-md"
          >
            動物切替
          </button>
          <button
            onClick={handleResetGrowth}
            className="bg-rose-800/90 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-md"
          >
            動物リセット
          </button>
          <button
            onClick={() => setGrowthCount((prev) => prev + 1)}
            className="bg-slate-800/90 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-md"
          >
            成長テスト
          </button>
        </div>
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