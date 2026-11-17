'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { ADULTS_TO_UNLOCK, AREA_ORDER, FIRST_AREA, findAnimalDef, findAreaDef } from '@/lib/zooAreas'
import type { AreaType, Stage } from '@/lib/zooAreas'
import { contentSize, loadSpriteSheet } from '@/lib/spriteSheet'
import type { SpriteFrame, SpriteSheet } from '@/lib/spriteSheet'

/* ============================================================
 * 育成パネル(タスク画面の右側 / 単独では /zoo/training)
 *
 * - 表示する内容は、すべて DB(/api/user-animals と /api/areas)から読み込む。
 * - 育てている動物は「大人になっていない動物のうち、いちばん古い1匹」。
 *   タスク完了の API(src/app/api/tasks/[id]/complete/route.ts)と同じ決め方。
 * - 成長のルールは src/lib/game.ts の calcStage と同じ
 *   (1〜3タスク: 赤ちゃん / 4〜8タスク: 子供 / 9タスク: 大人)。
 * - 動物は、エリアの地面の上をスプライト(歩くアニメーション)で歩き回る。
 *   スプライトは src/lib/zooAreas.ts の sprites に、成長段階ごとに登録する。
 *   ない動物・段階は、絵文字で歩く。
 * - 地面の上に、ゲームの画面のように情報(HUD)を重ねる。
 *   左上: 動物の名前とレベル / 右上: エリアの開園状況 / 下: 成長ゲージ
 * - タスクを完了すると、タスク画面から reload() が呼ばれて読み直し、
 *   前回との違いを見て「+1」「LEVEL UP!」「NEW!」の演出を出す。
 * - 大人になった動物は、「動物園へ送る」で動物園に配置できる(/api/zoo/place)。
 * ============================================================ */

// ===== 型 =====
interface UserAnimal {
  id: string
  stage: Stage
  task_count: number
  is_placed: boolean
  animal: { name: string; area_type: AreaType; area: { name: string } }
}

interface AreaStatus {
  area_type: AreaType
  name: string
  order: number
  is_unlocked: boolean
}

// タスク画面(src/app/tasks/layout.tsx)から呼ぶ操作
export interface IkuseiHandle {
  reload: () => void
}

interface IkuseiViewProps {
  isEmbedded?: boolean // タスク画面に埋め込むときは true
}

type CelebrationKind = 'acquired' | 'growUp'

interface Celebration {
  kind: CelebrationKind
  text: string
}

// ===== 成長のルール(src/lib/game.ts と同じ値にする) =====
const CHILD_AT = 4 // この数のタスクで子供になる
const ADULT_AT = 9 // この数のタスクで大人になる

const STAGE_LABEL: Record<Stage, string> = { BABY: '赤ちゃん', CHILD: '子供', ADULT: '大人' }
const STAGE_LEVEL: Record<Stage, number> = { BABY: 1, CHILD: 2, ADULT: 3 }

// 成長段階ごとの大きさ(舞台の横幅に対する%)。大きくなるほど、大きく表示する
// 絵の 横×縦 の平方根がこの値になるようにする(元の画像の大きさや余白が違っても、そろって見える)
const STAGE_SPRITE_SIZE: Record<Stage, number> = { BABY: 22, CHILD: 26, ADULT: 30 }
const STAGE_EMOJI_SIZE: Record<Stage, number> = { BABY: 13, CHILD: 17, ADULT: 21 }

const WALK_SPEED = 9 // 歩く速さ(1秒あたり、舞台の横幅の何%か)
const WALK_MIN_X = 18 // 歩ける範囲(舞台の横幅に対する%)
const WALK_MAX_X = 82

// ===== スプライトシートの読み込み(src/lib/spriteSheet.ts) =====
type SheetState = { status: 'none' } | { status: 'loading' } | { status: 'ready'; sheet: SpriteSheet } | { status: 'error' }

// スプライトを読み込むフック。ファイルがないときは 'error' になり、絵文字で表示する
function useSpriteSheet(jsonUrl: string | undefined): SheetState {
  const [loaded, setLoaded] = useState<{ url: string; sheet: SpriteSheet | null } | null>(null)

  useEffect(() => {
    if (!jsonUrl) return
    let ignore = false
    loadSpriteSheet(jsonUrl)
      .then((sheet) => {
        if (!ignore) setLoaded({ url: jsonUrl, sheet })
      })
      .catch(() => {
        if (!ignore) setLoaded({ url: jsonUrl, sheet: null })
      })
    return () => {
      ignore = true
    }
  }, [jsonUrl])

  if (!jsonUrl) return { status: 'none' }
  if (!loaded || loaded.url !== jsonUrl) return { status: 'loading' }
  return loaded.sheet ? { status: 'ready', sheet: loaded.sheet } : { status: 'error' }
}

// 1コマ分を表示するための背景の指定。
// コマのうち「透明でない部分」だけを切り出すので、足元が箱の下端になる。
// 箱の大きさは%で指定する(箱の横幅は、width で渡す)
function frameStyle(sheet: SpriteSheet, frame: SpriteFrame, width?: string): CSSProperties {
  const { content } = sheet
  const srcX = frame.x + content.x
  const srcY = frame.y + content.y
  const posX = sheet.sheetW > content.w ? (srcX / (sheet.sheetW - content.w)) * 100 : 0
  const posY = sheet.sheetH > content.h ? (srcY / (sheet.sheetH - content.h)) * 100 : 0
  return {
    width,
    backgroundImage: `url(${sheet.image})`,
    backgroundSize: `${(sheet.sheetW / content.w) * 100}% ${(sheet.sheetH / content.h) * 100}%`,
    backgroundPosition: `${posX}% ${posY}%`,
    aspectRatio: `${content.w} / ${content.h}`,
  }
}

// 絵の大きさが size(cqw)になるときの、箱の横幅
function spriteWidth(sheet: SpriteSheet, size: number): string {
  return `${(sheet.content.w / contentSize(sheet)) * size}cqw`
}

// ===== 補助の関数 =====
function spriteOf(name: string, stage: Stage) {
  return findAnimalDef(name)?.sprites?.[stage]
}

// 成長段階と動物ごとの倍率から、表示する大きさ(cqw)を決める
function spriteSize(name: string, stage: Stage): number {
  return STAGE_SPRITE_SIZE[stage] * (findAnimalDef(name)?.scale ?? 1)
}

function animalEmoji(name: string): string {
  return findAnimalDef(name)?.emoji ?? '🐾'
}

function randomBetween(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min))
}

// エリアの背景(壁紙があれば壁紙、なければ色のグラデーション)
function sceneBackground(type: AreaType): CSSProperties {
  const def = findAreaDef(type)
  if (!def) return {}
  return { backgroundImage: def.wallpaper ? `url(${def.wallpaper}), ${def.fallback}` : def.fallback }
}

// 前回の読み込みと比べて、何が起きたかを調べる(最初の読み込みでは、演出を出さない)
function findChange(
  prev: UserAnimal[] | null,
  next: UserAnimal[],
): { celebration: Celebration | null; progressed: boolean } {
  if (!prev) return { celebration: null, progressed: false }

  const prevById = new Map(prev.map((a) => [a.id, a]))
  let progressed = false

  for (const animal of next) {
    const before = prevById.get(animal.id)
    if (!before) {
      return {
        celebration: { kind: 'acquired', text: `${animal.animal.name}の赤ちゃんがやってきた!` },
        progressed: true,
      }
    }
    if (before.stage !== animal.stage) {
      return {
        celebration: { kind: 'growUp', text: `${animal.animal.name}が${STAGE_LABEL[animal.stage]}になった!` },
        progressed: true,
      }
    }
    if (before.task_count !== animal.task_count) progressed = true
  }
  return { celebration: null, progressed }
}

// ===== 地面を歩き回る動物 =====
function AnimalWalker({
  name,
  stage,
  hopKey,
  celebration,
}: {
  name: string
  stage: Stage
  hopKey: number // 増えると、ぴょんと跳ねて「+1」を出す
  celebration: CelebrationKind | null // 演出中は立ち止まり、光の柱を出す
}) {
  const sprite = spriteOf(name, stage)
  const sheetState = useSpriteSheet(sprite?.walk)
  const idleState = useSpriteSheet(sprite?.idle)
  const sheet = sheetState.status === 'ready' ? sheetState.sheet : null
  const idleSheet = idleState.status === 'ready' ? idleState.sheet : null // なければ、歩くコマの最初で止まる
  const size = spriteSize(name, stage)

  const posRef = useRef<HTMLDivElement>(null) // 横の位置を動かす箱
  const flipRef = useRef<HTMLDivElement>(null) // 向きを変える箱
  const frameRef = useRef<HTMLDivElement>(null) // スプライトの1コマを表示する箱
  const movingRef = useRef(false)
  const frozenRef = useRef(false)
  const facingRef = useRef<1 | -1>(-1) // 絵の向き。絵文字はふつう左向き

  useEffect(() => {
    frozenRef.current = celebration !== null
  }, [celebration])

  useEffect(() => {
    facingRef.current = sheet ? sheet.facing : -1
  }, [sheet])

  // 歩く(位置と向きは、再描画せずに直接書き換える)
  // 跳ねるときに中の箱が作り直されるので、ref は毎回読み直す
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let x = 50
    let target = 50
    let dir: 1 | -1 = 1
    let last = performance.now()
    let pauseUntil = last + 900
    let frame = 0
    const pickTarget = () => {
      target = WALK_MIN_X + Math.random() * (WALK_MAX_X - WALK_MIN_X)
    }
    pickTarget()

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      let moving = false
      if (!reduceMotion && !frozenRef.current && now >= pauseUntil) {
        const distance = target - x
        if (Math.abs(distance) < 0.5) {
          pauseUntil = now + 1200 + Math.random() * 2600 // 着いたら少し休む
          pickTarget()
        } else {
          dir = distance > 0 ? 1 : -1
          x += dir * Math.min(Math.abs(distance), WALK_SPEED * dt)
          moving = true
        }
      }
      const posEl = posRef.current
      const flipEl = flipRef.current
      if (posEl) {
        posEl.classList.toggle('walking', moving)
        posEl.style.left = `${x}%`
      }
      movingRef.current = moving
      // 進む向きと、絵の向きが同じなら、そのまま。逆なら左右反転する
      if (flipEl) flipEl.style.transform = `scaleX(${dir === facingRef.current ? 1 : -1})`
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // スプライトのコマを進める
  // 歩いている間は歩くコマ。止まっている間は idle のコマ(なければ、歩くコマの最初で止める)
  useEffect(() => {
    if (!sheet) return
    let current = sheet
    let index = 0
    let timer = 0
    const step = () => {
      const moving = movingRef.current
      const next = !moving && idleSheet ? idleSheet : sheet
      if (next !== current) {
        current = next
        index = 0
      } else {
        index = moving || idleSheet ? (index + 1) % current.frames.length : 0
      }
      const f = current.frames[index]
      const el = frameRef.current
      if (el) Object.assign(el.style, frameStyle(current, f, spriteWidth(current, size)))
      timer = window.setTimeout(step, f.duration)
    }
    step()
    return () => window.clearTimeout(timer)
  }, [sheet, idleSheet, size])

  return (
    <div ref={posRef} className="ik-walker">
      {celebration && <div className={`ik-pillar ik-pillar-${celebration}`} aria-hidden="true" />}

      {/* key が変わると、跳ねるアニメーションと「+1」をもう一度再生する */}
      <div key={hopKey} className={`ik-walker-body${hopKey > 0 ? ' ik-hop' : ''}`}>
        {hopKey > 0 && !celebration && (
          <span className="ik-plus" aria-hidden="true">
            +1
          </span>
        )}
        <div ref={flipRef} className="ik-flip">
          {sheet ? (
            <div
              ref={frameRef}
              className="ik-sprite"
              style={frameStyle(sheet, sheet.frames[0], spriteWidth(sheet, size))}
              role="img"
              aria-label={`${name}(${STAGE_LABEL[stage]})`}
            />
          ) : sheetState.status === 'loading' ? (
            <div style={{ width: `${size}cqw`, aspectRatio: '1 / 1' }} />
          ) : (
            <span
              className="ik-emoji"
              style={{ fontSize: `${STAGE_EMOJI_SIZE[stage]}cqw` }}
              role="img"
              aria-label={`${name}(${STAGE_LABEL[stage]})`}
            >
              {animalEmoji(name)}
            </span>
          )}
        </div>
      </div>
      <div className="ik-shadow" style={{ width: `${size * 0.8}cqw` }} />

      {celebration && (
        <>
          <span className="ik-sparkle ik-sparkle-1" aria-hidden="true">✦</span>
          <span className="ik-sparkle ik-sparkle-2" aria-hidden="true">✦</span>
          <span className="ik-sparkle ik-sparkle-3" aria-hidden="true">★</span>
        </>
      )}
    </div>
  )
}

// 一覧に出す、小さな動物のアイコン(大人のスプライトの最初のコマ。なければ絵文字)
function AnimalThumb({ name, stage }: { name: string; stage: Stage }) {
  const sheetState = useSpriteSheet(spriteOf(name, stage)?.walk)
  if (sheetState.status === 'ready') {
    const { sheet } = sheetState
    return <div className="ik-thumb ik-sprite" style={frameStyle(sheet, sheet.frames[0])} aria-hidden="true" />
  }
  return (
    <span className="ik-thumb ik-thumb-emoji" aria-hidden="true">
      {animalEmoji(name)}
    </span>
  )
}

// ===== 育成パネル本体 =====
export const IkuseiView = forwardRef<IkuseiHandle, IkuseiViewProps>(function IkuseiView(
  { isEmbedded = false },
  ref,
) {
  const { data: session } = useSession()
  const [animals, setAnimals] = useState<UserAnimal[] | null>(null) // null のときは読み込み中
  const [areas, setAreas] = useState<AreaStatus[]>([])
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0) // 増やすと、読み直す
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const [hopKey, setHopKey] = useState(0)
  const [placingId, setPlacingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const prevAnimalsRef = useRef<UserAnimal[] | null>(null) // 前回読み込んだ動物(演出の判定用)

  // タスク画面から呼ばれる。タスクを完了したあとに読み直す
  useImperativeHandle(ref, () => ({
    reload: () => setReloadKey((key) => key + 1),
  }))

  // DB から、動物とエリアを読み込む
  useEffect(() => {
    if (!session) return
    let ignore = false

    Promise.all([fetch('/api/user-animals'), fetch('/api/areas')])
      .then(async ([animalsRes, areasRes]) => {
        if (!animalsRes.ok) throw new Error('育成データを読み込めません')
        const animalData = (await animalsRes.json()) as UserAnimal[]
        const areaData = areasRes.ok ? ((await areasRes.json()) as AreaStatus[]) : []
        if (ignore) return

        const change = findChange(prevAnimalsRef.current, animalData)
        prevAnimalsRef.current = animalData

        setAnimals(animalData)
        setAreas(areaData)
        setLoadError(false)
        if (change.celebration) setCelebration(change.celebration)
        if (change.progressed) setHopKey((key) => key + 1)
      })
      .catch(() => {
        if (!ignore) setLoadError(true)
      })

    return () => {
      ignore = true
    }
  }, [session, reloadKey])

  // 演出と通知は、しばらくしたら消す
  useEffect(() => {
    if (!celebration) return
    const timer = setTimeout(() => setCelebration(null), 3000)
    return () => clearTimeout(timer)
  }, [celebration])

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(''), 3000)
    return () => clearTimeout(timer)
  }, [message])

  // 大人になった動物を、動物園に送る(配置する)
  const handlePlace = async (target: UserAnimal) => {
    setPlacingId(target.id)
    try {
      const res = await fetch('/api/zoo/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAnimalId: target.id,
          area_type: target.animal.area_type,
          // 位置は 0〜100(%)。地面のあたりに、ランダムで置く
          pos_x: randomBetween(20, 80),
          pos_y: randomBetween(60, 85),
        }),
      })
      if (res.ok) {
        setMessage(`${target.animal.name}を動物園に送りました`)
        setReloadKey((key) => key + 1)
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setMessage(body?.error ?? '動物園に送れませんでした')
      }
    } catch {
      setMessage('通信に失敗しました。もう一度ためしてください')
    } finally {
      setPlacingId(null)
    }
  }

  // ----- 表示用の計算 -----
  const list = animals ?? []
  const growing = list.find((a) => a.stage !== 'ADULT') ?? null // いま育てている動物
  const adults = list.filter((a) => a.stage === 'ADULT')
  const waitingCount = adults.filter((a) => !a.is_placed).length

  // いちばん新しく開園したエリア(新しい赤ちゃんは、このエリアからやってくる)
  const unlockedTypes = AREA_ORDER.filter((type) => areas.find((a) => a.area_type === type)?.is_unlocked)
  const currentArea: AreaType = unlockedTypes[unlockedTypes.length - 1] ?? FIRST_AREA
  const nextArea: AreaType | null = AREA_ORDER[AREA_ORDER.indexOf(currentArea) + 1] ?? null
  const adultsInCurrent = adults.filter((a) => a.animal.area_type === currentArea).length
  const areaLabel = (type: AreaType): string => {
    const def = findAreaDef(type)
    const name = areas.find((a) => a.area_type === type)?.name ?? def?.name ?? type
    return `${def?.emoji ?? ''}${name}`
  }

  const sceneArea: AreaType = growing ? growing.animal.area_type : currentArea
  const count = growing ? Math.min(growing.task_count, ADULT_AT) : 0
  const nextGoal = count < CHILD_AT ? CHILD_AT : ADULT_AT
  const nextGoalLabel = count < CHILD_AT ? '子供' : '大人'
  const ready = animals !== null && !loadError

  return (
    <section className={`ik-panel${isEmbedded ? ' ik-embedded' : ''}`}>
      {/* ===== 見出し(木の看板) ===== */}
      <header className="ik-head">
        <h2 className="ik-title">
          <span aria-hidden="true">🐣</span> 育成中の動物
        </h2>
        <Link href="/zoo/map" className="ik-head-link">
          動物園へ →
        </Link>
      </header>

      {/* ===== 舞台(エリアの地面と、歩き回る動物。上に HUD を重ねる) ===== */}
      <div className="ik-scene" style={sceneBackground(sceneArea)}>
        {/* --- 動物 --- */}
        {ready && growing && (
          <AnimalWalker
            key={`${growing.id}-${growing.stage}`}
            name={growing.animal.name}
            stage={growing.stage}
            hopKey={hopKey}
            celebration={celebration?.kind ?? null}
          />
        )}

        {/* --- まだ動物がいないとき: シルエットと看板 --- */}
        {ready && !growing && (
          <div className="ik-empty">
            <div className="ik-mystery">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/ui/mystery_animal.png" alt="" draggable={false} />
            </div>
            <p className="ik-signboard">
              {list.length === 0 ? 'タスクを1つ完了すると' : '次のタスクを完了すると'}
              <br />
              赤ちゃんがやってくる!
            </p>
          </div>
        )}

        {animals === null && !loadError && <p className="ik-note">読み込み中…</p>}
        {loadError && (
          <div className="ik-note">
            <p>動物の情報を読み込めませんでした</p>
            <button className="ik-btn" onClick={() => setReloadKey((key) => key + 1)}>
              もう一度読み込む
            </button>
          </div>
        )}

        {/* --- HUD 左上: 名前とレベル --- */}
        {ready && (
          <div className="ik-hud ik-hud-name">
            <p className="ik-hud-label">{growing ? `Lv.${STAGE_LEVEL[growing.stage]}` : 'Lv.-'}</p>
            <p className="ik-hud-title">{growing ? growing.animal.name : '???'}</p>
            <p className="ik-hud-sub">{growing ? STAGE_LABEL[growing.stage] : 'まだいません'}</p>
          </div>
        )}

        {/* --- HUD 右上: エリアの開園状況 --- */}
        {ready && (
          <div className="ik-hud ik-hud-area">
            <p className="ik-hud-label">{areaLabel(currentArea)}</p>
            <p className="ik-stars" aria-label={`大人 ${adultsInCurrent} / ${ADULTS_TO_UNLOCK} 匹`}>
              {Array.from({ length: ADULTS_TO_UNLOCK }, (_, i) => (
                <span key={i} className={i < adultsInCurrent ? 'on' : ''}>
                  ★
                </span>
              ))}
            </p>
            <p className="ik-hud-sub">
              {nextArea ? (
                <>
                  あと<strong>{Math.max(ADULTS_TO_UNLOCK - adultsInCurrent, 0)}</strong>匹で
                  <br />
                  {areaLabel(nextArea)}開園
                </>
              ) : (
                '全エリア開園!'
              )}
            </p>
          </div>
        )}

        {/* --- HUD 下: 成長ゲージ --- */}
        {ready && (
          <div className="ik-hud ik-hud-gauge">
            <div className="ik-gauge-head">
              <span>成長ゲージ</span>
              <span className="ik-gauge-count">
                {count}/{ADULT_AT}
              </span>
            </div>
            <ol className="ik-gauge" aria-label={`成長ゲージ ${count} / ${ADULT_AT}`}>
              {Array.from({ length: ADULT_AT }, (_, i) => {
                const step = i + 1
                const filled = step <= count
                const isNext = growing !== null && step === count + 1
                const milestone = step === CHILD_AT ? '子' : step === ADULT_AT ? '大' : null
                return (
                  <li
                    key={step}
                    className={`ik-cell${filled ? ' filled' : ''}${isNext ? ' next' : ''}${milestone ? ' milestone' : ''}`}
                  >
                    {milestone && <span className="ik-cell-mark">{milestone}</span>}
                  </li>
                )
              })}
            </ol>
            <p className="ik-gauge-hint">
              {growing ? (
                <>
                  あと<strong>{nextGoal - count}</strong>タスクで{nextGoalLabel}に!
                </>
              ) : (
                'タスクを完了して、新しい動物を迎えよう'
              )}
            </p>
          </div>
        )}

        {/* --- 演出: LEVEL UP! / NEW! --- */}
        {celebration && (
          <div className={`ik-banner ik-banner-${celebration.kind}`} role="status">
            <p className="ik-banner-big">{celebration.kind === 'growUp' ? 'LEVEL UP!' : 'NEW!'}</p>
            <p className="ik-banner-text">{celebration.text}</p>
          </div>
        )}
      </div>

      {/* ===== 大人になった動物(動物園に送れる) ===== */}
      {adults.length > 0 && (
        <div className="ik-box">
          <div className="ik-box-head">
            <span>大人になった動物</span>
            {waitingCount > 0 && <span className="ik-badge">送れる {waitingCount}</span>}
          </div>
          <ul className="ik-adults">
            {adults.map((a) => (
              <li key={a.id} className="ik-adult">
                <AnimalThumb name={a.animal.name} stage="ADULT" />
                <div className="ik-adult-text">
                  <p className="ik-adult-name">{a.animal.name}</p>
                  <p className="ik-adult-area">{areaLabel(a.animal.area_type)}</p>
                </div>
                {a.is_placed ? (
                  <span className="ik-placed">✓ 動物園にいます</span>
                ) : (
                  <button className="ik-btn ik-btn-go" onClick={() => handlePlace(a)} disabled={placingId !== null}>
                    {placingId === a.id ? '送っています…' : '動物園へ送る'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {message && (
        <p className="ik-message" role="status">
          {message}
        </p>
      )}

      <style jsx global>{`
        /* ---- パネル全体(木の枠) ---- */
        .ik-panel {
          container-type: inline-size;
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
          padding: 14px;
          background: var(--wood, #8b5e34);
          border: 3px solid var(--wood-dark, #6b4423);
          border-radius: 16px;
          box-shadow: 0 4px 0 var(--wood-dark, #6b4423);
          color: #f4e6b8;
          font-family: var(--font-dot, monospace);
          user-select: none;
        }
        /* タスク画面で横に並ぶとき(PC): 画面の高さに収め、はみ出す分はパネルの中でスクロール */
        @media (min-width: 1024px) {
          .ik-panel.ik-embedded {
            max-height: calc(100dvh - 48px);
            overflow-y: auto;
          }
        }
        /* 右から引き出すパネル(スマホ・タブレット)では、角を丸めない */
        @media (max-width: 1023px) {
          .ik-panel.ik-embedded {
            border-radius: 0;
            box-shadow: none;
            min-height: 100%;
          }
        }

        /* ---- 見出し ---- */
        .ik-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 2px 4px;
        }
        .ik-title {
          font-family: var(--font-round, sans-serif);
          font-size: 18px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: var(--cream, #fffaf0);
        }
        .ik-head-link {
          font-size: 13px;
          color: #ffe066;
          white-space: nowrap;
        }
        .ik-head-link:hover {
          text-decoration: underline;
        }

        /* ---- 舞台 ---- */
        .ik-scene {
          position: relative;
          container-type: inline-size; /* 中の大きさを、舞台の横幅に合わせる(cqw) */
          aspect-ratio: 1 / 1;
          overflow: hidden;
          border: 4px solid #0b0d17;
          border-radius: 6px;
          background-color: #6fae4a;
          background-size: cover;
          background-position: center bottom;
          image-rendering: pixelated;
        }
        @container (max-width: 400px) {
          .ik-scene {
            aspect-ratio: 4 / 5;
          }
        }
        .ik-note {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          text-shadow: 0 2px 0 #0b0d17;
          z-index: 4;
        }

        /* ---- 歩く動物 ---- */
        .ik-walker {
          position: absolute;
          left: 50%;
          bottom: 30%; /* 足元の高さ(下の成長ゲージの上) */
          display: flex;
          flex-direction: column;
          align-items: center;
          transform: translateX(-50%);
          z-index: 1;
        }
        .ik-walker-body {
          position: relative;
          z-index: 1;
        }
        .ik-flip {
          transform-origin: center bottom;
        }
        .ik-sprite {
          display: block;
          background-repeat: no-repeat;
          image-rendering: pixelated;
        }
        .ik-emoji {
          display: block;
          line-height: 1;
          transform-origin: center bottom;
        }
        .ik-walker.walking .ik-emoji {
          animation: ik-step 0.4s steps(2) infinite;
        }
        .ik-shadow {
          height: 3cqw;
          margin-top: -2.2cqw;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.25);
        }
        @keyframes ik-step {
          0% {
            transform: translateY(0) rotate(-3deg);
          }
          100% {
            transform: translateY(-0.8cqw) rotate(3deg);
          }
        }
        .ik-hop {
          animation: ik-hop 0.6s ease-out;
        }
        @keyframes ik-hop {
          0% {
            transform: translateY(0);
          }
          35% {
            transform: translateY(-7cqw);
          }
          60% {
            transform: translateY(0);
          }
          75% {
            transform: translateY(-2cqw);
          }
          100% {
            transform: translateY(0);
          }
        }
        .ik-plus {
          position: absolute;
          left: 50%;
          top: -4cqw;
          z-index: 2;
          font-size: 6cqw;
          font-weight: bold;
          color: #ffe066;
          text-shadow: 2px 2px 0 #0b0d17;
          pointer-events: none;
          animation: ik-float 1.2s ease-out forwards;
        }
        @keyframes ik-float {
          0% {
            transform: translate(-50%, 0);
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -10cqw);
            opacity: 0;
          }
        }

        /* 光の柱(成長したとき・新しい動物が来たとき) */
        .ik-pillar {
          position: absolute;
          left: 50%;
          bottom: 0;
          width: 120%;
          height: 200cqw;
          transform: translateX(-50%);
          background: linear-gradient(to top, rgba(255, 240, 160, 0.85), rgba(255, 240, 160, 0));
          /* 左右の端をぼかして、柱の形にする */
          mask-image: linear-gradient(to right, transparent, #000 30%, #000 70%, transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, #000 30%, #000 70%, transparent);
          animation: ik-pillar 3s ease-out forwards;
          pointer-events: none;
        }
        .ik-pillar-acquired {
          background: linear-gradient(to top, rgba(170, 240, 255, 0.85), rgba(170, 240, 255, 0));
        }
        @keyframes ik-pillar {
          0% {
            opacity: 0;
            transform: translateX(-50%) scaleX(0.2);
          }
          15% {
            opacity: 1;
            transform: translateX(-50%) scaleX(1);
          }
          75% {
            opacity: 0.8;
          }
          100% {
            opacity: 0;
            transform: translateX(-50%) scaleX(0.6);
          }
        }
        .ik-sparkle {
          position: absolute;
          z-index: 2;
          font-size: 5cqw;
          color: #fff6b0;
          text-shadow: 0 0 6px #fff;
          animation: ik-twinkle 0.9s ease-in-out infinite;
          pointer-events: none;
        }
        .ik-sparkle-1 {
          left: -10%;
          top: 10%;
        }
        .ik-sparkle-2 {
          right: -10%;
          top: 30%;
          animation-delay: 0.3s;
        }
        .ik-sparkle-3 {
          left: 45%;
          top: -15%;
          animation-delay: 0.6s;
        }
        @keyframes ik-twinkle {
          0%,
          100% {
            transform: scale(0.5);
            opacity: 0.2;
          }
          50% {
            transform: scale(1.2);
            opacity: 1;
          }
        }

        /* ---- まだ動物がいないとき ---- */
        .ik-empty {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 30%;
          display: flex;
          flex-direction: column;
          align-items: center;
          z-index: 1;
        }
        .ik-mystery {
          width: 26cqw;
          animation: ik-sway 1.6s ease-in-out infinite;
          transform-origin: bottom center;
        }
        .ik-mystery img {
          display: block;
          width: 100%;
          height: auto;
          opacity: 0.75;
        }
        @keyframes ik-sway {
          0%,
          100% {
            transform: rotate(-6deg);
          }
          50% {
            transform: rotate(6deg);
          }
        }
        .ik-signboard {
          margin-top: -2cqw;
          padding: 8px 14px;
          background: var(--wood, #8b5e34);
          border: 3px solid var(--wood-dark, #6b4423);
          box-shadow: 0 3px 0 var(--wood-dark, #6b4423);
          color: var(--cream, #fffaf0);
          font-family: var(--font-round, sans-serif);
          font-weight: 700;
          font-size: 13px;
          line-height: 1.6;
          text-align: center;
        }

        /* ---- HUD(ドット風の枠) ---- */
        .ik-hud {
          position: absolute;
          z-index: 3;
          padding: 6px 9px;
          background: rgba(30, 34, 53, 0.88);
          border: 3px solid #f4e6b8;
          box-shadow: 0 0 0 3px #0b0d17;
          color: #f4e6b8;
          line-height: 1.35;
        }
        .ik-hud-label {
          font-size: 11px;
          color: #ffe066;
        }
        .ik-hud-title {
          font-size: 16px;
          font-weight: bold;
        }
        .ik-hud-sub {
          font-size: 11px;
        }
        .ik-hud-sub strong {
          margin: 0 2px;
          font-size: 14px;
          color: #ff8a65;
        }
        .ik-hud-name {
          top: 9px;
          left: 9px;
          max-width: 46%;
        }
        .ik-hud-area {
          top: 9px;
          right: 9px;
          max-width: 46%;
          text-align: right;
        }
        .ik-stars {
          font-size: 15px;
          letter-spacing: 2px;
          color: #4a4f6e;
        }
        .ik-stars .on {
          color: #ffd84a;
          text-shadow: 1px 1px 0 #0b0d17;
        }

        /* 成長ゲージ */
        .ik-hud-gauge {
          left: 9px;
          right: 9px;
          bottom: 9px;
        }
        .ik-gauge-head {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          margin-bottom: 4px;
        }
        .ik-gauge-count {
          color: #ffe066;
        }
        .ik-gauge {
          display: grid;
          grid-template-columns: repeat(9, 1fr);
          gap: 3px;
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .ik-cell {
          position: relative;
          height: 16px;
          background: #3a3f5c;
          border: 2px solid #0b0d17;
        }
        .ik-cell.filled {
          background: #7bd85a;
          box-shadow: inset 0 3px 0 #b6f59a, inset 0 -3px 0 #4f9e36;
        }
        .ik-cell.milestone {
          border-color: #ffd84a;
        }
        .ik-cell.next {
          animation: ik-blink 0.9s steps(2) infinite;
        }
        @keyframes ik-blink {
          0% {
            background: #3a3f5c;
          }
          100% {
            background: #6b7a4a;
          }
        }
        .ik-cell-mark {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          font-size: 10px;
          color: #ffd84a;
          text-shadow: 1px 1px 0 #0b0d17;
        }
        .ik-cell.filled .ik-cell-mark {
          color: #fff;
        }
        .ik-gauge-hint {
          margin-top: 5px;
          font-size: 12px;
        }
        .ik-gauge-hint strong {
          margin: 0 2px;
          font-size: 15px;
          color: #ff8a65;
        }

        /* ---- 演出の文字 ---- */
        .ik-banner {
          position: absolute;
          left: 50%;
          top: 19%;
          z-index: 4;
          transform: translateX(-50%);
          text-align: center;
          white-space: nowrap;
          pointer-events: none;
          animation: ik-pop 0.5s ease-out;
        }
        .ik-banner-big {
          font-size: 10cqw;
          font-weight: bold;
          color: #ffe066;
          text-shadow: 3px 3px 0 #c0392b, -2px -2px 0 #0b0d17, 2px -2px 0 #0b0d17, -2px 2px 0 #0b0d17;
          letter-spacing: 0.05em;
          animation: ik-shine 0.5s steps(2) infinite;
        }
        .ik-banner-acquired .ik-banner-big {
          color: #aaf0ff;
          text-shadow: 3px 3px 0 #2f6fb0, -2px -2px 0 #0b0d17, 2px -2px 0 #0b0d17, -2px 2px 0 #0b0d17;
        }
        .ik-banner-text {
          display: inline-block;
          margin-top: 4px;
          padding: 4px 10px;
          background: rgba(30, 34, 53, 0.9);
          border: 3px solid #f4e6b8;
          box-shadow: 0 0 0 3px #0b0d17;
          font-size: 13px;
        }
        @keyframes ik-pop {
          0% {
            transform: translateX(-50%) scale(0.3);
            opacity: 0;
          }
          70% {
            transform: translateX(-50%) scale(1.15);
            opacity: 1;
          }
          100% {
            transform: translateX(-50%) scale(1);
          }
        }
        @keyframes ik-shine {
          0% {
            filter: brightness(1);
          }
          100% {
            filter: brightness(1.3);
          }
        }

        /* ---- 大人になった動物 ---- */
        .ik-box {
          padding: 10px 12px;
          background: #1e2235;
          border: 3px solid #f4e6b8;
          box-shadow: 0 0 0 3px #0b0d17;
        }
        .ik-box-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 14px;
          font-weight: bold;
        }
        .ik-badge {
          padding: 1px 8px;
          background: #c0392b;
          color: #fff;
          font-size: 11px;
          animation: ik-blink-badge 1s steps(2) infinite;
        }
        @keyframes ik-blink-badge {
          0% {
            opacity: 1;
          }
          100% {
            opacity: 0.6;
          }
        }
        .ik-adults {
          display: flex;
          flex-direction: column;
          gap: 6px;
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .ik-adult {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 4px 6px;
          background: #2a2f48;
          border: 2px solid #0b0d17;
        }
        .ik-thumb {
          width: 40px;
          flex-shrink: 0;
        }
        .ik-thumb-emoji {
          font-size: 28px;
          line-height: 40px;
          text-align: center;
        }
        .ik-adult-text {
          flex: 1;
          min-width: 0;
        }
        .ik-adult-name {
          font-size: 14px;
          font-weight: bold;
        }
        .ik-adult-area {
          font-size: 11px;
          color: #b9b08c;
        }
        .ik-placed {
          font-size: 12px;
          color: #7bd85a;
          white-space: nowrap;
        }

        /* ---- ボタン(押すと沈む) ---- */
        .ik-btn {
          font-family: inherit;
          font-size: 12px;
          color: #1e2235;
          background: #f4e6b8;
          border: 3px solid #0b0d17;
          box-shadow: inset -3px -3px 0 #c9b273, 3px 3px 0 #0b0d17;
          padding: 5px 10px;
          white-space: nowrap;
          cursor: pointer;
        }
        .ik-btn:hover:not(:disabled) {
          background: #fff2c6;
        }
        .ik-btn:active:not(:disabled) {
          transform: translate(3px, 3px);
          box-shadow: inset -3px -3px 0 #c9b273, 0 0 0 #0b0d17;
        }
        .ik-btn:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .ik-btn-go {
          background: #7bd85a;
          box-shadow: inset -3px -3px 0 #4f9e36, 3px 3px 0 #0b0d17;
        }
        .ik-btn-go:hover:not(:disabled) {
          background: #9be67f;
        }

        /* ---- 通知 ---- */
        .ik-message {
          padding: 6px 10px;
          background: #1e2235;
          border: 3px solid #7bd85a;
          color: #7bd85a;
          font-size: 13px;
          text-align: center;
        }

        /* 動きを減らす設定の人には、アニメーションを止める */
        @media (prefers-reduced-motion: reduce) {
          .ik-walker.walking .ik-emoji,
          .ik-hop,
          .ik-plus,
          .ik-pillar,
          .ik-sparkle,
          .ik-mystery,
          .ik-cell.next,
          .ik-banner,
          .ik-banner-big,
          .ik-badge {
            animation: none;
          }
        }
      `}</style>
    </section>
  )
})

IkuseiView.displayName = 'IkuseiView'
