'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { CSSProperties } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

/* ============================================================
 * 動物園画面(1エリアを壁紙つきで表示し、動物が歩き回る)
 *
 * - 「動物園」を開くと、1つのエリアが画面いっぱいに表示される
 * - エリアの切り替えは、右下の「エリアマップ」ボタンから行う
 * - 動物は、スプライトシート(JSON + PNG)があればそのアニメーションで、
 *   なければ絵文字で、画面内を歩き回る
 * ============================================================ */

// ===== 型 =====
type AreaType = 'JUNGLE' | 'SAVANNA' | 'SNOW' | 'WATER'

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

interface AnimalDef {
  name: string
  emoji: string
  spriteJson?: string // スプライトのJSONファイルのパス(例: '/assets/sprites/crocodile/sprite-sheet.json')
}

interface AreaDef {
  type: AreaType
  name: string
  emoji: string
  unlockHint: string
  wallpaper?: string // 壁紙の画像。なければ fallback の色を使う
  fallback: string // 壁紙がないエリア用の背景(CSSのグラデーション)
  animals: AnimalDef[]
}

interface MenuButton {
  id: 'tasks' | 'training' | 'map' | 'book'
  icon: string
  label: string
  href?: string
}

// ===== スプライトシート(JSON)の型 =====
interface SpriteFrame {
  x: number
  y: number
  w: number
  h: number
  duration: number
}

interface SpriteSheetJson {
  meta: {
    image: string
    size: { w: number; h: number }
    frameSize: { w: number; h: number }
  }
  frames: Record<string, SpriteFrame>
  animations: Record<string, number[]>
}

interface SpriteSheet {
  imageUrl: string
  sheetW: number
  sheetH: number
  frameW: number
  frameH: number
  totalDuration: number
  animName: string
  keyframes: string
}

// ===== エリアと動物のデータ(4エリア × 3体) =====
const AREA_DEFS: AreaDef[] = [
  {
    type: 'JUNGLE',
    name: 'ジャングル',
    emoji: '🌿',
    unlockHint: '最初から解放済み',
    fallback: 'linear-gradient(#86d0a8 0%, #86d0a8 18%, #3f9b4a 18%, #2b6e34 100%)',
    animals: [
      { name: 'ゴリラ', emoji: '🦍' },
      { name: 'オウム', emoji: '🦜' },
      { name: 'サル', emoji: '🐒' },
    ],
  },
  {
    type: 'SAVANNA',
    name: 'サバンナ',
    emoji: '🌵',
    unlockHint: 'ジャングルで大人3匹育成',
    wallpaper: '/assets/areas/savanna/background.png',
    fallback: 'linear-gradient(#9fd4ff 0%, #9fd4ff 15%, #e7c867 15%, #d9b04a 100%)',
    animals: [
      { name: 'ライオン', emoji: '🦁' },
      { name: 'ゾウ', emoji: '🐘' },
      { name: 'キリン', emoji: '🦒' },
    ],
  },
  {
    type: 'SNOW',
    name: '雪',
    emoji: '❄️',
    unlockHint: 'サバンナで大人3匹育成',
    fallback: 'linear-gradient(#bfe3ff 0%, #bfe3ff 20%, #eaf4ff 20%, #cfe3f5 100%)',
    animals: [
      { name: 'シロクマ', emoji: '🐻‍❄️' },
      { name: 'ペンギン', emoji: '🐧' },
      { name: 'アザラシ', emoji: '🦭' },
    ],
  },
  {
    type: 'WATER',
    name: '水',
    emoji: '🌊',
    unlockHint: '雪で大人3匹育成',
    fallback: 'linear-gradient(#9fd4ff 0%, #9fd4ff 18%, #4f9fe0 18%, #2f6fb0 100%)',
    animals: [
      { name: 'カバ', emoji: '🦛' },
      { name: 'ワニ', emoji: '🐊', spriteJson: '/assets/sprites/crocodile/sprite-sheet.json' },
      { name: 'フラミンゴ', emoji: '🦩' },
    ],
  },
]

// ▼ テスト用(あとで削除): サバンナにも、スプライトを試すためのワニを追加で歩かせる
const TEST_EXTRA_ANIMALS: Partial<Record<AreaType, AnimalDef[]>> = {
  SAVANNA: [
    {
      name: 'ワニ(テスト)',
      emoji: '🐊',
      spriteJson: '/assets/sprites/crocodile/sprite-sheet.json',
    },
  ],
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

// ===== 動物の見た目・動きの設定 =====
const SPRITE_ZOOM = 3 // スプライトを何倍にして表示するか(ドット絵なので整数がおすすめ)
const FOOT_PADDING = 3 // スプライト画像の下側の余白(元画像のpx)。足元を地面に合わせるため
const EMOJI_BOX = 32 // 絵文字で表示するときの大きさ(×SPRITE_ZOOM)
const WALK_SPEED_PX = 60 // 歩く速さ(1秒あたりのpx)
// 動物が歩き回れる範囲(画面に対する%)。壁紙の地面の部分に合わせる
const WALK_X_MIN = 8
const WALK_X_MAX = 92
const WALK_Y_MIN = 48
const WALK_Y_MAX = 92

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

// ===== スプライトシート(JSON)の読み込み =====
// JSONの中身から、アニメーション用のCSS(keyframes)を作る。
// 同じJSONは1回だけ読み込んで使い回す。
const sheetCache = new Map<string, Promise<SpriteSheet>>()

function buildSpriteSheet(jsonUrl: string, json: SpriteSheetJson): SpriteSheet {
  const dir = jsonUrl.slice(0, jsonUrl.lastIndexOf('/') + 1)
  const order = json.animations.default ?? Object.keys(json.frames).map(Number)

  const frames: SpriteFrame[] = []
  for (const index of order) {
    const frame = json.frames[String(index)]
    if (frame) frames.push(frame)
  }

  const totalDuration = frames.reduce((sum, f) => sum + (f.duration || 125), 0)
  const animName = `spr-${jsonUrl.replace(/[^a-zA-Z0-9]/g, '-')}`

  const position = (f: SpriteFrame) =>
    `background-position: calc(var(--zoom) * ${-f.x}px) calc(var(--zoom) * ${-f.y}px);`

  let elapsed = 0
  const stops: string[] = []
  for (const f of frames) {
    const percent = (elapsed / totalDuration) * 100
    stops.push(`${percent.toFixed(3)}% { ${position(f)} }`)
    elapsed += f.duration || 125
  }
  const last = frames[frames.length - 1]
  if (last) stops.push(`100% { ${position(last)} }`)

  return {
    imageUrl: dir + json.meta.image,
    sheetW: json.meta.size.w,
    sheetH: json.meta.size.h,
    frameW: json.meta.frameSize.w,
    frameH: json.meta.frameSize.h,
    totalDuration,
    animName,
    keyframes: `@keyframes ${animName} { ${stops.join(' ')} }`,
  }
}

function loadSpriteSheet(jsonUrl: string): Promise<SpriteSheet> {
  let promise = sheetCache.get(jsonUrl)
  if (!promise) {
    promise = fetch(jsonUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`スプライトJSONを読み込めません: ${jsonUrl}`)
        return res.json() as Promise<SpriteSheetJson>
      })
      .then((json) => buildSpriteSheet(jsonUrl, json))
      .catch((error) => {
        sheetCache.delete(jsonUrl) // 失敗したら、次回もう一度読み込めるようにする
        throw error
      })
    sheetCache.set(jsonUrl, promise)
  }
  return promise
}

function useSpriteSheet(jsonUrl?: string): SpriteSheet | null {
  const [sheet, setSheet] = useState<SpriteSheet | null>(null)

  useEffect(() => {
    if (!jsonUrl) return
    let cancelled = false
    loadSpriteSheet(jsonUrl)
      .then((loaded) => {
        if (!cancelled) setSheet(loaded)
      })
      .catch(() => {
        if (!cancelled) setSheet(null) // 失敗したら、絵文字のまま表示する
      })
    return () => {
      cancelled = true
    }
  }, [jsonUrl])

  return sheet
}

// ===== スプライト1体の表示(playing が true の間だけ、歩くアニメーションを再生) =====
function SpriteView({
  sheet,
  zoom,
  playing,
}: {
  sheet: SpriteSheet
  zoom: number
  playing: boolean
}) {
  const style = {
    '--zoom': zoom,
    width: sheet.frameW * zoom,
    height: sheet.frameH * zoom,
    backgroundImage: `url(${sheet.imageUrl})`,
    backgroundSize: `${sheet.sheetW * zoom}px ${sheet.sheetH * zoom}px`,
    backgroundPosition: '0px 0px', // 止まっているときは、1コマ目を表示
    animation: playing ? `${sheet.animName} ${sheet.totalDuration}ms step-end infinite` : 'none',
  } as CSSProperties

  return (
    <>
      <style>{sheet.keyframes}</style>
      <div className="zoo-sprite" style={style} />
    </>
  )
}

// ===== 歩き回る動物 =====
// 「止まる → 行き先を決める → 歩く → 止まる」を繰り返す。
function WanderingAnimal({ animal }: { animal: AnimalDef }) {
  const sheet = useSpriteSheet(animal.spriteJson)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [moving, setMoving] = useState(false)
  const [facingLeft, setFacingLeft] = useState(false)
  const [travelMs, setTravelMs] = useState(0)
  const posRef = useRef({ x: 50, y: 70 })

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    // 最初の位置(画面ごとにランダム)
    const start = { x: rand(WALK_X_MIN, WALK_X_MAX), y: rand(WALK_Y_MIN, WALK_Y_MAX) }
    posRef.current = start
    setPos(start)

    const walk = () => {
      if (cancelled) return
      const from = posRef.current
      const to = { x: rand(WALK_X_MIN, WALK_X_MAX), y: rand(WALK_Y_MIN, WALK_Y_MAX) }
      const dxPx = ((to.x - from.x) / 100) * window.innerWidth
      const dyPx = ((to.y - from.y) / 100) * window.innerHeight
      const distance = Math.hypot(dxPx, dyPx)
      const duration = Math.max(800, (distance / WALK_SPEED_PX) * 1000)

      posRef.current = to
      if (Math.abs(dxPx) > 4) setFacingLeft(dxPx < 0)
      setTravelMs(duration)
      setPos(to)
      setMoving(true)

      // 着いたら止まって、しばらくしてからまた歩く
      timer = setTimeout(() => {
        if (cancelled) return
        setMoving(false)
        timer = setTimeout(walk, rand(1000, 4000))
      }, duration)
    }

    timer = setTimeout(walk, rand(300, 2500))
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  if (!pos) return null

  const boxW = sheet ? sheet.frameW * SPRITE_ZOOM : EMOJI_BOX * SPRITE_ZOOM
  const boxH = sheet ? sheet.frameH * SPRITE_ZOOM : EMOJI_BOX * SPRITE_ZOOM
  const footPad = sheet ? FOOT_PADDING * SPRITE_ZOOM : 0

  return (
    <div
      className="zoo-wanderer"
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        width: boxW,
        height: boxH,
        marginTop: footPad,
        zIndex: Math.round(pos.y * 10), // 画面の下にいる動物ほど手前に表示
        transition: moving ? `left ${travelMs}ms linear, top ${travelMs}ms linear` : 'none',
      }}
    >
      <div className="zoo-wanderer-shadow" style={{ bottom: footPad - 6 }} />
      {/* 左に歩くときは、左右を反転(画像は右向き) */}
      <div className="zoo-wanderer-body" style={{ transform: facingLeft ? 'scaleX(-1)' : 'none' }}>
        {sheet ? (
          <SpriteView sheet={sheet} zoom={SPRITE_ZOOM} playing={moving} />
        ) : (
          <span
            className={`zoo-wanderer-emoji${moving ? ' moving' : ''}`}
            style={{ fontSize: EMOJI_BOX * SPRITE_ZOOM * 0.8 }}
          >
            {animal.emoji}
          </span>
        )}
      </div>
      <span className="zoo-wanderer-name" style={{ top: boxH + footPad }}>
        {animal.name}
      </span>
    </div>
  )
}

function backgroundStyle(def: AreaDef): CSSProperties {
  return {
    backgroundImage: def.wallpaper ? `url(${def.wallpaper}), ${def.fallback}` : def.fallback,
  }
}

export default function ZooPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [areas, setAreas] = useState<Area[]>([])
  const [userAnimals, setUserAnimals] = useState<UserAnimal[]>([])
  const [currentType, setCurrentType] = useState<AreaType>('SAVANNA') // 開発中はサバンナから表示
  const [mapOpen, setMapOpen] = useState(false)
  const [previewAll, setPreviewAll] = useState(true) // テスト用: 全エリアを解放した状態で確認する
  const [notice, setNotice] = useState('')

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
  const animalsHere = [...activeDef.animals, ...(TEST_EXTRA_ANIMALS[activeDef.type] ?? [])]

  return (
    <div className="zoo-stage">
      {/* ===== エリアの表示(壁紙 + 歩き回る動物)。エリアを切り替えると作り直される ===== */}
      <div key={activeDef.type} className="zoo-scene">
        <div className="zoo-bg" style={backgroundStyle(activeDef)} />
        {animalsHere.map((animal) => (
          <WanderingAnimal key={`${activeDef.type}-${animal.name}`} animal={animal} />
        ))}
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
          animation: zoo-fade 0.4s ease-out;
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

        /* ---- 歩き回る動物 ---- */
        .zoo-wanderer {
          position: absolute;
          transform: translate(-50%, -100%);
          pointer-events: none;
        }
        .zoo-wanderer-body {
          position: relative;
          width: 100%;
          height: 100%;
        }
        .zoo-wanderer-shadow {
          position: absolute;
          left: 50%;
          width: 60%;
          height: 12%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.25);
          border-radius: 50%;
        }
        .zoo-sprite {
          background-repeat: no-repeat;
          image-rendering: pixelated;
        }
        .zoo-wanderer-emoji {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          text-align: center;
          line-height: 1;
        }
        .zoo-wanderer-emoji.moving {
          animation: zoo-hop 0.45s step-end infinite;
        }
        @keyframes zoo-hop {
          0% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-8px);
          }
          100% {
            transform: translateY(0);
          }
        }
        .zoo-wanderer-name {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          margin-top: 4px;
          font-size: 12px;
          white-space: nowrap;
          background: rgba(11, 13, 23, 0.75);
          color: #f4e6b8;
          padding: 0 6px;
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