'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { CSSProperties } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { AREA_DEFS, DEFAULT_WALK_AREA, TEST_EXTRA_ANIMALS } from '@/lib/zooAreas'
import type { AnimalDef, AreaDef, AreaType } from '@/lib/zooAreas'
import type { ZooPixiControl } from '@/components/zoo/pixi/ZooPixiCanvas'

/* ============================================================
 * 動物園画面(1エリアを壁紙つきで表示し、動物が歩き回る)
 *
 * - 「動物園」を開くと、1つのエリアが画面いっぱいに表示される
 * - エリアの切り替えは、右下の「エリアマップ」ボタンから行う
 * - 動物と演出(タップの反応・目印・光の柱など)は PixiJS(<canvas>)で描く
 *   (components/zoo/pixi/)。壁紙・パネル・ボタンは HTML のまま
 * - 動物は、スプライトシート(JSON + PNG)があればそのアニメーションで、
 *   なければ絵文字で、画面内を歩き回る
 * ============================================================ */

// PixiJS はブラウザでしか動かないので、この画面を開いたときだけ読み込む(ほかの画面は重くならない)
const ZooPixiCanvas = dynamic(() => import('@/components/zoo/pixi/ZooPixiCanvas'), { ssr: false })

// エリアごとの動物の一覧。描き直しのたびに作り直さないように、最初に1回だけ作る
const ANIMALS_BY_AREA = Object.fromEntries(
  AREA_DEFS.map((def) => [def.type, [...def.animals, ...(TEST_EXTRA_ANIMALS[def.type] ?? [])]]),
) as Record<AreaType, AnimalDef[]>

// ===== 型 =====
interface Area {
  id: string
  name: string
  area_type: string
  order: number
  is_unlocked: boolean
}

interface UserAnimal {
  id: string
  stage: string
  is_placed: boolean
  animal: { name: string; area_type: string }
}

interface MenuButton {
  id: 'tasks' | 'training' | 'map' | 'book'
  icon: string
  label: string
  href?: string
}

// エリアマップでの並び順(左上→右上→左下→右下)
const AREA_MAP_ORDER: AreaType[] = ['JUNGLE', 'SAVANNA', 'WATER', 'SNOW']

// ===== 右下のメニューボタン(機能は未定なので、ここを書き換えるだけで変更できる) =====
const MENU_BUTTONS: MenuButton[] = [
  { id: 'tasks', icon: '📋', label: 'タスク', href: '/tasks' },
  { id: 'training', icon: '🐣', label: '育成', href: '/zoo/training' },
  { id: 'map', icon: '🗺️', label: 'エリア\nマップ' },
  { id: 'book', icon: '📖', label: '図鑑' },
]

// ===== 座標の調整用 =====
const SHOW_WALK_AREA = false // true にすると、歩ける範囲を線で表示する(座標の調整用)

// 壁紙と動物を同じ箱(ワールド)に入れて、画面サイズが変わってもずれないようにする
function worldStyle(def: AreaDef): CSSProperties | undefined {
  if (!def.wallpaperSize) return undefined
  return { '--zoo-world-aspect': def.wallpaperSize.w / def.wallpaperSize.h } as CSSProperties
}

function backgroundStyle(def: AreaDef): CSSProperties {
  return {
    backgroundImage: def.wallpaper ? `url(${def.wallpaper}), ${def.fallback}` : def.fallback,
  }
}

export function ZooScreen() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [areas, setAreas] = useState<Area[]>([])
  const [userAnimals, setUserAnimals] = useState<UserAnimal[]>([])
  const [currentType, setCurrentType] = useState<AreaType>('SAVANNA') // 開発中はサバンナから表示
  const [mapOpen, setMapOpen] = useState(false)
  const [previewAll, setPreviewAll] = useState(true) // テスト用: 全エリアを解放した状態で確認する
  const [notice, setNotice] = useState('')
  const pixiRef = useRef<ZooPixiControl | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const fetchData = useCallback(async () => {
    const [areasRes, animalsRes] = await Promise.all([
      fetch('/api/areas'),
      fetch('/api/user-animals'),
    ])
    if (areasRes.ok) setAreas(await areasRes.json())
    if (animalsRes.ok) setUserAnimals(await animalsRes.json())
  }, [])

  useEffect(() => {
    if (session) fetchData()
  }, [session, fetchData])

  if (status === 'loading') return null

  // ----- 表示用の計算 -----
  const isUnlocked = (type: AreaType): boolean => {
    if (previewAll) return true
    const found = areas.find((a) => a.area_type === type)
    if (found) return found.is_unlocked
    return type === 'JUNGLE' // APIから取れない場合は、ジャングルだけ解放扱い
  }

  const areaName = (def: AreaDef): string =>
    areas.find((a) => a.area_type === def.type)?.name ?? def.name

  const adultCount = (type: AreaType): number =>
    userAnimals.filter((a) => a.stage === 'ADULT' && a.animal.area_type === type).length

  const showNotice = (message: string) => {
    setNotice(message)
    setTimeout(() => setNotice(''), 2000)
  }

  const handleMenu = (button: MenuButton) => {
    if (button.id === 'map') {
      setMapOpen((prev) => !prev)
      return
    }
    if (button.href) {
      router.push(button.href)
    } else {
      showNotice(`${button.label}は準備中です`)
    }
  }

  const handleSelectArea = (def: AreaDef) => {
    if (isUnlocked(def.type)) {
      setCurrentType(def.type)
      setMapOpen(false)
    } else {
      showNotice(`🔒 ${def.unlockHint}`)
    }
  }

  const userName = session?.user?.name ?? 'ゲスト'
  const unlockedCount = AREA_DEFS.filter((a) => isUnlocked(a.type)).length
  const placedCount = userAnimals.filter((a) => a.is_placed).length
  const activeType: AreaType = isUnlocked(currentType) ? currentType : 'JUNGLE'
  const activeDef = AREA_DEFS.find((a) => a.type === activeType) ?? AREA_DEFS[0]
  const animalsHere = ANIMALS_BY_AREA[activeDef.type]

  return (
    <div className="zoo-stage">
      {/* ===== エリアの表示(壁紙 + 歩き回る動物)。エリアを切り替えると作り直される ===== */}
      <div key={activeDef.type} className="zoo-scene">
        <div className={`zoo-world${activeDef.wallpaperSize ? ' cover' : ''}`} style={worldStyle(activeDef)}>
          <div className="zoo-bg" style={backgroundStyle(activeDef)} />
          {SHOW_WALK_AREA && (
            <svg className="zoo-walk-debug" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polygon
                points={(activeDef.walkArea ?? DEFAULT_WALK_AREA)
                  .map((p) => `${p.x},${p.y}`)
                  .join(' ')}
              />
            </svg>
          )}
        </div>
        {/* 動物と演出(壁紙の上に、透明な canvas を重ねて描く) */}
        <ZooPixiCanvas def={activeDef} animals={animalsHere} controlRef={pixiRef} />
      </div>

      {/* ===== 左上: ユーザー情報 ===== */}
      <div className="zoo-panel zoo-hud-user">
        <div className="zoo-avatar">{userName.charAt(0)}</div>
        <div>
          <p className="zoo-user-name">{userName}</p>
          <p className="zoo-user-stat">🗺️ 解放エリア {unlockedCount} / 4</p>
          <p className="zoo-user-stat">🐾 配置した動物 {placedCount} / 12</p>
        </div>
      </div>

      {/* ===== 上: いま表示しているエリア名 ===== */}
      <div className="zoo-panel zoo-area-title">
        <span>
          {activeDef.emoji} {areaName(activeDef)}
        </span>
        <span className="zoo-area-sub">大人 {adultCount(activeDef.type)} / 3 匹</span>
      </div>

      {/* ===== 右上: テスト用(あとで削除) ===== */}
      <button className="zoo-btn zoo-debug" onClick={() => setPreviewAll((prev) => !prev)}>
        テスト: 全エリア解放 {previewAll ? 'ON' : 'OFF'}
      </button>
      <button className="zoo-btn zoo-debug" style={{ top: 56 }} onClick={() => pixiRef.current?.playGrowth()}>
        テスト: 光の柱
      </button>

      {/* ===== 右下: エリアマップ(簡易的な地図) ===== */}
      {mapOpen && (
        <div className="zoo-panel zoo-map-panel">
          <p className="zoo-map-title">🗺️ エリアマップ</p>
          <div className="zoo-map-grid">
            {AREA_MAP_ORDER.map((type) => {
              const def = AREA_DEFS.find((a) => a.type === type)
              if (!def) return null
              const unlocked = isUnlocked(type)
              const isCurrent = type === activeType
              return (
                <button
                  key={type}
                  className={`zoo-area-btn${isCurrent ? ' current' : ''}${unlocked ? '' : ' locked'}`}
                  onClick={() => handleSelectArea(def)}
                >
                  <span className="zoo-area-icon">{unlocked ? def.emoji : '🔒'}</span>
                  <span className="zoo-area-name">{areaName(def)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ===== 右下: メニューボタン ===== */}
      <div className="zoo-menu">
        {MENU_BUTTONS.map((button) => (
          <button
            key={button.id}
            className={`zoo-btn zoo-menu-btn${button.id === 'map' && mapOpen ? ' active' : ''}`}
            onClick={() => handleMenu(button)}
          >
            <span className="zoo-menu-icon">{button.icon}</span>
            <span className="zoo-menu-label">{button.label}</span>
          </button>
        ))}
      </div>

      {notice && <div className="zoo-notice">{notice}</div>}

      <style jsx global>{`
        .zoo-stage {
          position: fixed;
          inset: 0;
          z-index: 40;
          overflow: hidden;
          background: #1b1f3b;
          color: #f4e6b8;
          font-family: 'DotGothic16', 'MS Gothic', 'Osaka-Mono', monospace;
          user-select: none;
        }

        /* ---- エリア(壁紙 + 動物) ---- */
        .zoo-scene {
          position: absolute;
          inset: 0;
          container-type: size;
          animation: zoo-fade 0.4s ease-out;
        }
        /* 壁紙と動物を入れる箱。動物の位置はこの箱に対する%で決まる */
        .zoo-world {
          position: absolute;
          inset: 0;
          z-index: 0;
        }
        /* 壁紙の縦横比のまま、画面を覆う大きさにして中央に置く(background-size: cover と同じ) */
        .zoo-world.cover {
          inset: auto;
          left: 50%;
          top: 50%;
          width: max(100cqw, calc(100cqh * var(--zoo-world-aspect)));
          aspect-ratio: var(--zoo-world-aspect);
          transform: translate(-50%, -50%);
        }
        .zoo-walk-debug {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 1;
          pointer-events: none;
        }
        .zoo-walk-debug polygon {
          fill: rgba(0, 200, 255, 0.2);
          stroke: #00c8ff;
          stroke-width: 2px;
          vector-effect: non-scaling-stroke;
        }
        @keyframes zoo-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .zoo-bg {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          image-rendering: pixelated;
          z-index: 0;
        }

        /* ---- ドット風の枠(パネル) ---- */
        .zoo-panel {
          background: #1e2235;
          border: 4px solid #f4e6b8;
          box-shadow: 0 0 0 4px #0b0d17, 6px 6px 0 4px rgba(0, 0, 0, 0.45);
          padding: 12px 14px;
          z-index: 3000;
        }

        /* ---- ドット風のボタン(押すと沈む) ---- */
        .zoo-btn {
          font-family: inherit;
          color: #1e2235;
          background: #f4e6b8;
          border: 4px solid #0b0d17;
          box-shadow: inset -4px -4px 0 #c9b273, 4px 4px 0 #0b0d17;
          cursor: pointer;
          padding: 8px 12px;
        }
        .zoo-btn:hover {
          background: #fff2c6;
        }
        .zoo-btn:active {
          transform: translate(4px, 4px);
          box-shadow: inset -4px -4px 0 #c9b273, 0 0 0 #0b0d17;
        }

        /* ---- 左上: ユーザー情報 ---- */
        .zoo-hud-user {
          position: absolute;
          top: 16px;
          left: 16px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .zoo-avatar {
          width: 52px;
          height: 52px;
          display: grid;
          place-items: center;
          background: #f4e6b8;
          color: #1e2235;
          font-size: 26px;
          font-weight: bold;
          border: 4px solid #0b0d17;
        }
        .zoo-user-name {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 4px;
        }
        .zoo-user-stat {
          font-size: 12px;
          line-height: 1.6;
        }

        /* ---- 上: エリア名 ---- */
        .zoo-area-title {
          position: absolute;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: baseline;
          gap: 14px;
          font-size: 18px;
          font-weight: bold;
          white-space: nowrap;
        }
        .zoo-area-sub {
          font-size: 12px;
          font-weight: normal;
        }

        /* ---- 右上: テスト用ボタン ---- */
        .zoo-debug {
          position: absolute;
          top: 16px;
          right: 16px;
          z-index: 3000;
          font-size: 12px;
          padding: 6px 10px;
        }

        /* ---- 右下: メニューボタン ---- */
        .zoo-menu {
          position: absolute;
          right: 20px;
          bottom: 20px;
          display: flex;
          gap: 14px;
          z-index: 3000;
        }
        .zoo-menu-btn {
          width: 80px;
          height: 80px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 4px;
        }
        .zoo-menu-btn.active {
          background: #ffe066;
        }
        .zoo-menu-icon {
          font-size: 28px;
          line-height: 1;
        }
        .zoo-menu-label {
          font-size: 11px;
          font-weight: bold;
          line-height: 1.2;
          text-align: center;
          white-space: pre-line;
        }

        /* ---- 右下: エリアマップ ---- */
        .zoo-map-panel {
          position: absolute;
          right: 20px;
          bottom: 130px;
          width: 250px;
        }
        .zoo-map-title {
          font-size: 14px;
          font-weight: bold;
          margin-bottom: 10px;
        }
        .zoo-map-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .zoo-area-btn {
          font-family: inherit;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 10px 4px;
          color: #1e2235;
          background: #f4e6b8;
          border: 4px solid #0b0d17;
          box-shadow: inset -4px -4px 0 #c9b273, 3px 3px 0 #0b0d17;
          cursor: pointer;
        }
        .zoo-area-btn:hover {
          background: #fff2c6;
        }
        .zoo-area-btn:active {
          transform: translate(3px, 3px);
          box-shadow: inset -4px -4px 0 #c9b273, 0 0 0 #0b0d17;
        }
        .zoo-area-btn.current {
          background: #ffe066;
          border-color: #c0392b;
        }
        .zoo-area-btn.locked {
          background: #6b6f87;
          box-shadow: inset -4px -4px 0 #4e5169, 3px 3px 0 #0b0d17;
        }
        .zoo-area-icon {
          font-size: 26px;
          line-height: 1;
        }
        .zoo-area-name {
          font-size: 12px;
          font-weight: bold;
        }

        /* ---- 通知(準備中など) ---- */
        .zoo-notice {
          position: absolute;
          left: 50%;
          bottom: 130px;
          transform: translateX(-50%);
          background: #1e2235;
          border: 4px solid #f4e6b8;
          padding: 8px 16px;
          font-size: 14px;
          z-index: 3500;
        }
      `}</style>
    </div>
  )
}