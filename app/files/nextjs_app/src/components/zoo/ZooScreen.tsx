'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { CSSProperties, MouseEvent, RefObject } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  gatherOffset,
  getVisibleArea,
  isInVisibleArea,
  lastReachablePoint,
  pickStandingPoint,
  pickWalkTarget,
  resolveDestination,
} from '@/lib/zooWalk'
import type { WalkPoint } from '@/lib/zooWalk'
import {
  AREA_DEFS,
  COMMAND_PAUSE_MS,
  COMMAND_SPEED_PX,
  DEFAULT_WALK_AREA,
  EMOJI_BOX,
  FOOT_PADDING,
  GATHER_RADIUS_PX,
  SPRITE_ZOOM,
  TEST_EXTRA_ANIMALS,
  WALK_SPEED_PX,
} from '@/lib/zooAreas'
import type { AnimalDef, AreaDef, AreaType } from '@/lib/zooAreas'
import type { ZooPixiControl } from '@/components/zoo/pixi/ZooPixiCanvas'

/* ============================================================
 * 動物園画面(1エリアを壁紙つきで表示し、動物が歩き回る)
 *
 * - 「動物園」を開くと、1つのエリアが画面いっぱいに表示される
 * - エリアの切り替えは、右下の「エリアマップ」ボタンから行う
 * - 動物は、スプライトシート(JSON + PNG)があればそのアニメーションで、
 *   なければ絵文字で、画面内を歩き回る
 * - 動物の描き方は2通り(PixiJS への移行中のため)
 *     html: HTML と CSS で描く(/zoo/map)
 *     pixi: PixiJS(<canvas>)で描く(/zoo/pixi)。壁紙とパネルは HTML のまま
 * ============================================================ */

export type ZooRenderer = 'html' | 'pixi'

// PixiJS は pixi のときだけ読み込む(html のときやほかの画面は重くならない)
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

// 親(ZooPage)から動物を動かすための操作
interface AnimalController {
  // 指定の場所へ歩く。着くまでの時間(ms)を返す
  goTo: (tap: WalkPoint, offsetPx: WalkPoint, onArrive?: () => void) => number
  waitUntil: (time: number) => void // 着いたあと、この時刻までは歩き出さない
  hold: () => void // その場で止まって待つ
  release: () => void // 待つのをやめて、自由に歩き出す
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
const SHOW_WALK_AREA = false // true にすると、歩ける範囲を線で表示する(座標の調整用)

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
// タップで指示されたときは、指定の場所へ歩いて少し待ってから、また繰り返す。
function WanderingAnimal({
  id,
  animal,
  def,
  sceneRef,
  controllersRef,
  selected,
  onTap,
}: {
  id: string
  animal: AnimalDef
  def: AreaDef
  sceneRef: RefObject<HTMLDivElement | null>
  controllersRef: RefObject<Map<string, AnimalController>>
  selected: boolean
  onTap: (id: string) => void
}) {
  const sheet = useSpriteSheet(animal.spriteJson)
  const [pos, setPos] = useState<WalkPoint | null>(null)
  const [moving, setMoving] = useState(false)
  const [facingLeft, setFacingLeft] = useState(false)
  const [travelMs, setTravelMs] = useState(0)
  const [reactionId, setReactionId] = useState(0) // 0 以外の間、タップの反応を再生する
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const walkArea = def.walkArea ?? DEFAULT_WALK_AREA
    let target: WalkPoint = walkArea[0] // いまの行き先(止まっているときは、いまいる場所)
    let trip: { from: WalkPoint; startedAt: number; duration: number } | null = null
    let held = false // 選ばれて、その場で待っている間は true
    let onArriveCommand: (() => void) | null = null
    let resumeAt = 0 // 指示された場所に着いたあと、また歩き出す時刻

    const measure = () => {
      const scene = sceneRef.current?.getBoundingClientRect()
      const body = bodyRef.current?.getBoundingClientRect()
      return getVisibleArea(
        scene?.width ?? window.innerWidth,
        scene?.height ?? window.innerHeight,
        def.wallpaperSize,
        body?.width ?? EMOJI_BOX * SPRITE_ZOOM,
        body?.height ?? EMOJI_BOX * SPRITE_ZOOM,
      )
    }

    // 歩いている途中でも、いま実際にいる場所を返す
    const currentPos = (): WalkPoint => {
      if (!trip) return target
      const t = Math.min(1, (performance.now() - trip.startedAt) / trip.duration)
      return {
        x: trip.from.x + (target.x - trip.from.x) * t,
        y: trip.from.y + (target.y - trip.from.y) * t,
      }
    }

    const place = (point: WalkPoint) => {
      target = point
      trip = null
      setMoving(false)
      setPos(point)
    }

    const restThenWalk = () => {
      timer = setTimeout(walk, rand(1000, 4000))
    }

    const finishCommand = () => {
      const onArrive = onArriveCommand
      onArriveCommand = null
      onArrive?.()
    }

    const startTrip = (to: WalkPoint, speed: number, onDone: () => void): number => {
      const area = measure()
      const from = currentPos()
      const dxPx = ((to.x - from.x) / 100) * area.worldW
      const dyPx = ((to.y - from.y) / 100) * area.worldH
      const distance = Math.hypot(dxPx, dyPx)
      const duration = Math.max(800, (distance / speed) * 1000)

      target = to
      trip = { from, startedAt: performance.now(), duration }
      if (Math.abs(dxPx) > 4) setFacingLeft(dxPx < 0)
      setTravelMs(duration)
      setPos(to)
      setMoving(true)

      timer = setTimeout(() => {
        if (cancelled) return
        trip = null
        setMoving(false)
        onDone()
      }, duration)
      return duration
    }

    const walk = () => {
      if (cancelled || held) return
      finishCommand()
      const area = measure()
      const from = currentPos()
      const to = pickWalkTarget(from, walkArea, area)

      if (!to) {
        // 行ける場所がなければ休む。画面の外にいるときだけ、見える場所へ移す
        place(isInVisibleArea(from, area) ? from : (pickStandingPoint(walkArea, area) ?? from))
        restThenWalk()
        return
      }

      // 着いたら止まって、しばらくしてからまた歩く
      startTrip(to, WALK_SPEED_PX, restThenWalk)
    }

    const controller: AnimalController = {
      goTo: (tap, offsetPx, onArrive) => {
        if (timer) clearTimeout(timer)
        held = false
        onArriveCommand = onArrive ?? null
        const area = measure()
        const wanted = {
          x: tap.x + (offsetPx.x / area.worldW) * 100,
          y: tap.y + (offsetPx.y / area.worldH) * 100,
        }
        const destination = resolveDestination(wanted, walkArea, area)
        const to = lastReachablePoint(currentPos(), destination, walkArea)
        const duration = startTrip(to, COMMAND_SPEED_PX, () => {
          finishCommand()
          timer = setTimeout(walk, Math.max(0, resumeAt - performance.now()) + rand(0, 1000))
        })
        resumeAt = performance.now() + duration + COMMAND_PAUSE_MS
        return duration
      },
      waitUntil: (time) => {
        resumeAt = time
      },
      hold: () => {
        if (timer) clearTimeout(timer)
        held = true
        onArriveCommand = null
        place(currentPos())
      },
      release: () => {
        if (!held) return
        held = false
        restThenWalk()
      },
    }

    // 画面の大きさや向きが変わって行き先が見えなくなったら、すぐ見える場所へ歩き直す
    const handleResize = () => {
      const area = measure()
      if (isInVisibleArea(target, area)) return
      if (held) {
        place(pickStandingPoint(walkArea, area) ?? target)
        return
      }
      if (timer) clearTimeout(timer)
      walk()
    }

    // 最初の位置(画面ごとにランダム)
    place(pickStandingPoint(walkArea, measure()) ?? walkArea[0])
    timer = setTimeout(walk, rand(300, 2500))
    window.addEventListener('resize', handleResize)
    const controllers = controllersRef.current
    controllers.set(id, controller)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      window.removeEventListener('resize', handleResize)
      controllers.delete(id)
    }
  }, [id, def, sceneRef, controllersRef])

  if (!pos) return null

  const zoom = animal.zoom ?? SPRITE_ZOOM
  const boxW = sheet ? sheet.frameW * zoom : EMOJI_BOX * SPRITE_ZOOM
  const boxH = sheet ? sheet.frameH * zoom : EMOJI_BOX * SPRITE_ZOOM
  const footPad = sheet ? (animal.footPadding ?? FOOT_PADDING) * zoom : 0

  const handleTap = () => {
    setReactionId((prev) => prev + 1)
    onTap(id)
  }

  return (
    <div
      ref={bodyRef}
      className={`zoo-wanderer${selected ? ' selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={animal.name}
      aria-pressed={selected}
      onClick={(e) => {
        e.stopPropagation() // 地面のタップとして扱わない
        handleTap()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleTap()
        }
      }}
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
      {selected && <div className="zoo-wanderer-ring" style={{ bottom: footPad - 10 }} />}
      {/* タップされたら、跳ねてハートを出す */}
      {reactionId > 0 && (
        <span
          key={`heart-${reactionId}`}
          className="zoo-wanderer-heart"
          onAnimationEnd={() => setReactionId(0)}
        >
          💗
        </span>
      )}
      <div key={`hop-${reactionId}`} className={`zoo-wanderer-hop${reactionId > 0 ? ' play' : ''}`}>
        {/* 左に歩くときは、左右を反転(画像は右向き) */}
        <div
          className="zoo-wanderer-body"
          style={{ transform: facingLeft ? 'scaleX(-1)' : 'none' }}
        >
          {sheet ? (
            <SpriteView sheet={sheet} zoom={zoom} playing={moving} />
          ) : (
            <span
              className={`zoo-wanderer-emoji${moving ? ' moving' : ''}`}
              style={{ fontSize: EMOJI_BOX * SPRITE_ZOOM * 0.8 }}
            >
              {animal.emoji}
            </span>
          )}
        </div>
      </div>
      <span className="zoo-wanderer-name" style={{ top: boxH + footPad }}>
        {animal.name}
      </span>
    </div>
  )
}

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

export function ZooScreen({ renderer = 'html' }: { renderer?: ZooRenderer }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [areas, setAreas] = useState<Area[]>([])
  const [userAnimals, setUserAnimals] = useState<UserAnimal[]>([])
  const [currentType, setCurrentType] = useState<AreaType>('SAVANNA') // 開発中はサバンナから表示
  const [mapOpen, setMapOpen] = useState(false)
  const [previewAll, setPreviewAll] = useState(true) // テスト用: 全エリアを解放した状態で確認する
  const [notice, setNotice] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [marker, setMarker] = useState<(WalkPoint & { id: number }) | null>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const pixiRef = useRef<ZooPixiControl | null>(null)
  const controllersRef = useRef(new Map<string, AnimalController>())
  const markerIdRef = useRef(0)

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
      setSelectedId(null)
    } else {
      showNotice(`🔒 ${def.unlockHint}`)
    }
  }

  // 動物をタップ: 選ぶ。選択中の動物をもう一度タップすると解除、別の動物なら切り替え
  const handleAnimalTap = (id: string) => {
    const controllers = controllersRef.current
    if (selectedId) controllers.get(selectedId)?.release()
    if (selectedId === id) {
      setSelectedId(null)
      return
    }
    controllers.get(id)?.hold()
    setSelectedId(id)
  }

  // 地面をタップ: 選択中の動物がそこへ歩く。誰も選ばれていなければ、全員が集まる
  const handleGroundTap = (e: MouseEvent<HTMLDivElement>) => {
    const world = worldRef.current?.getBoundingClientRect()
    if (!world) return
    const tap = {
      x: ((e.clientX - world.left) / world.width) * 100,
      y: ((e.clientY - world.top) / world.height) * 100,
    }
    markerIdRef.current += 1
    setMarker({ ...tap, id: markerIdRef.current })

    const controllers = controllersRef.current
    const selectedAnimal = selectedId ? controllers.get(selectedId) : undefined
    if (selectedAnimal) {
      selectedAnimal.goTo(tap, { x: 0, y: 0 }, () => {
        setSelectedId((current) => (current === selectedId ? null : current))
      })
      return
    }
    const sceneWidth = sceneRef.current?.clientWidth ?? window.innerWidth
    const radius = Math.min(GATHER_RADIUS_PX, sceneWidth / 4)
    const all = [...controllers.values()]
    const durations = all.map((animal, i) => animal.goTo(tap, gatherOffset(i, all.length, radius)))
    // 最後の1匹が着いてから、みんなで歩き出す
    const resumeAt = performance.now() + Math.max(...durations) + COMMAND_PAUSE_MS
    all.forEach((animal) => animal.waitUntil(resumeAt))
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
      <div
        key={activeDef.type}
        ref={sceneRef}
        className="zoo-scene"
        onClick={renderer === 'html' ? handleGroundTap : undefined}
      >
        <div
          ref={worldRef}
          className={`zoo-world${activeDef.wallpaperSize ? ' cover' : ''}`}
          style={worldStyle(activeDef)}
        >
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
          {/* タップした場所の目印 */}
          {marker && (
            <div
              key={marker.id}
              className="zoo-tap-marker"
              style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
              onAnimationEnd={() => setMarker(null)}
            />
          )}
          {renderer === 'html' &&
            animalsHere.map((animal) => {
              const id = `${activeDef.type}-${animal.name}`
              return (
                <WanderingAnimal
                  key={id}
                  id={id}
                  animal={animal}
                  def={activeDef}
                  sceneRef={sceneRef}
                  controllersRef={controllersRef}
                  selected={selectedId === id}
                  onTap={handleAnimalTap}
                />
              )
            })}
        </div>
        {renderer === 'pixi' && (
          <ZooPixiCanvas def={activeDef} animals={animalsHere} showStats controlRef={pixiRef} />
        )}
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
      {renderer === 'pixi' && (
        <button
          className="zoo-btn zoo-debug"
          style={{ top: 56 }}
          onClick={() => pixiRef.current?.playGrowth()}
        >
          テスト: 光の柱
        </button>
      )}

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

        /* ---- 歩き回る動物 ---- */
        .zoo-wanderer {
          position: absolute;
          transform: translate(-50%, -100%);
          cursor: pointer;
          outline: none;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }
        .zoo-wanderer:focus-visible .zoo-wanderer-name {
          outline: 2px solid #fff;
        }
        .zoo-wanderer-ring {
          position: absolute;
          left: 50%;
          width: 90%;
          height: 26%;
          transform: translateX(-50%);
          border: 4px solid #fff;
          border-radius: 50%;
          box-shadow: 0 0 10px 2px rgba(255, 90, 90, 0.9);
          animation: zoo-ring 0.9s ease-in-out infinite alternate;
          pointer-events: none;
        }
        @keyframes zoo-ring {
          from {
            opacity: 0.55;
          }
          to {
            opacity: 1;
          }
        }
        .zoo-wanderer-hop {
          position: relative;
          width: 100%;
          height: 100%;
        }
        .zoo-wanderer-hop.play {
          animation: zoo-react-hop 0.45s ease-out;
        }
        @keyframes zoo-react-hop {
          0%,
          100% {
            transform: translateY(0);
          }
          40% {
            transform: translateY(-22px);
          }
        }
        .zoo-wanderer-heart {
          position: absolute;
          left: 50%;
          top: 0;
          z-index: 1;
          font-size: 24px;
          line-height: 1;
          pointer-events: none;
          animation: zoo-react-heart 0.9s ease-out forwards;
        }
        @keyframes zoo-react-heart {
          from {
            opacity: 1;
            transform: translate(-50%, 0) scale(0.7);
          }
          to {
            opacity: 0;
            transform: translate(-50%, -48px) scale(1.2);
          }
        }
        /* ---- タップした場所の目印 ---- */
        .zoo-tap-marker {
          position: absolute;
          width: 56px;
          height: 28px;
          border: 3px solid #fff;
          border-radius: 50%;
          z-index: 1;
          pointer-events: none;
          animation: zoo-tap-marker 0.7s ease-out forwards;
        }
        @keyframes zoo-tap-marker {
          from {
            opacity: 0.9;
            transform: translate(-50%, -50%) scale(0.3);
          }
          to {
            opacity: 0;
            transform: translate(-50%, -50%) scale(1.3);
          }
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
          pointer-events: none;
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