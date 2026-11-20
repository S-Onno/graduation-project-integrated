'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  AREA_DEFS,
  AREA_ORDER,
  DEFAULT_WALK_AREA,
  FIRST_AREA,
  SPECIES_PER_AREA,
  countAdultSpecies,
  findAnimalDef,
  zooAnimalDef,
} from '@/lib/zooAreas'
import type { AnimalDef, AreaDef, AreaType } from '@/lib/zooAreas'
import { AnimalArt, ZukanPanel, buildZukanRecords, discoveredKeys, useZukanSeen } from '@/components/zoo/ZukanPanel'

/* ============================================================
 * 動物園画面(1エリアを壁紙つきで表示し、動物が歩き回る)
 *
 * - 「動物園」を開くと、1つのエリアが画面いっぱいに表示される
 * - エリアの切り替えは、右下の「エリアマップ」ボタンから行う
 * - 右下の「図鑑」ボタンで、動物図鑑を画面の上に重ねて開く(components/zoo/ZukanPanel.tsx)
 * - 動物と演出(タップの反応・目印・光の柱など)は PixiJS(<canvas>)で描く
 *   (components/zoo/pixi/)。壁紙・パネル・ボタンは HTML のまま
 * - 歩いているのは、育成パネルで「動物園へ送る」をした大人の動物だけ
 * - 画面の大きさ(区切りは src/lib/screen.ts)
 *   - PC(横長の画面): エリアが画面いっぱい。左上にユーザー情報、上にエリア名、右下にメニュー
 *   - PCより狭い(1023px 以下): ユーザー情報とエリア名を、左上の1つの枠にまとめる
 *   - スマホ・縦長の画面: 上から「ユーザー情報とエリア名」「エリア全体(上下が少し切れる)」
 *     「このエリアの動物の状況」「メニュー」の順に並べる
 * - 動物は、スプライトシート(JSON + PNG)があればそのアニメーションで、
 *   なければ絵文字で、画面内を歩き回る
 * ============================================================ */

// PixiJS はブラウザでしか動かないので、この画面を開いたときだけ読み込む(ほかの画面は重くならない)
const ZooPixiCanvas = dynamic(() => import('@/components/zoo/pixi/ZooPixiCanvas'), { ssr: false })

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
  acquired_at?: string
  animal: { name: string; area_type: string }
}

interface MenuButton {
  id: 'tasks' | 'training' | 'map' | 'book'
  icon: string
  label: string
  href?: string
}

// エリアマップでの並び順(左上→右上→左下→右下)。開園する順番と同じ
const AREA_MAP_ORDER: AreaType[] = AREA_ORDER

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

interface ZooScreenProps {
  initialPanel?: 'zukan' // 開いたときに図鑑を出す(/zoo/zukan から開いたとき)
}

export function ZooScreen({ initialPanel }: ZooScreenProps = {}) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [areas, setAreas] = useState<Area[]>([])
  const [userAnimals, setUserAnimals] = useState<UserAnimal[]>([])
  const [currentType, setCurrentType] = useState<AreaType>(FIRST_AREA) // 最初はサバンナを表示
  const [mapOpen, setMapOpen] = useState(false)
  const [zukanOpen, setZukanOpen] = useState(initialPanel === 'zukan')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  // エリアと動物を読み込む(読み込みが終わってから state に入れる)
  useEffect(() => {
    if (!session) return
    let ignore = false
    Promise.all([fetch('/api/areas'), fetch('/api/user-animals')])
      .then(async ([areasRes, animalsRes]) => {
        const areaData = areasRes.ok ? ((await areasRes.json()) as Area[]) : null
        const animalData = animalsRes.ok ? ((await animalsRes.json()) as UserAnimal[]) : null
        if (ignore) return
        if (areaData) setAreas(areaData)
        if (animalData) setUserAnimals(animalData)
      })
      .catch((error) => console.error('動物園のデータを読み込めませんでした', error))
    return () => {
      ignore = true
    }
  }, [session])

  // エリアごとの、動物園に送った(配置した)動物。動物園にいるのは大人なので、大人の見た目で歩かせる
  // userAnimals が変わったときだけ作り直す(作り直すと、PixiJS の画面も作り直しになるため)
  const placedByArea = useMemo(() => {
    const map: Record<AreaType, AnimalDef[]> = { SAVANNA: [], JUNGLE: [], SNOW: [], WATER: [] }
    for (const userAnimal of userAnimals) {
      if (!userAnimal.is_placed) continue
      const type = userAnimal.animal.area_type as AreaType
      if (!map[type]) continue
      const def = findAnimalDef(userAnimal.animal.name)
      map[type].push(def ? zooAnimalDef(def) : { name: userAnimal.animal.name, emoji: '🐾' })
    }
    return map
  }, [userAnimals])

  // 図鑑の「NEW」の数(メニューの図鑑ボタンに出す)
  const { seen: zukanSeen } = useZukanSeen(session?.user?.id)
  const zukanNewCount = useMemo(
    () => discoveredKeys(buildZukanRecords(userAnimals)).filter((key) => !zukanSeen.has(key)).length,
    [userAnimals, zukanSeen],
  )

  if (status === 'loading') return null

  // ----- 表示用の計算 -----
  const isUnlocked = (type: AreaType): boolean => {
    const found = areas.find((a) => a.area_type === type)
    if (found) return found.is_unlocked
    return type === FIRST_AREA // APIから取れない場合は、最初のエリアだけ開園扱い
  }

  const areaName = (def: AreaDef): string =>
    areas.find((a) => a.area_type === def.type)?.name ?? def.name

  // 大人まで育てた種類の数(全種類そろうと、次のエリアが開園する)
  const adultCount = (type: AreaType): number => countAdultSpecies(userAnimals, type)

  const showNotice = (message: string) => {
    setNotice(message)
    setTimeout(() => setNotice(''), 2000)
  }

  const handleMenu = (button: MenuButton) => {
    if (button.id === 'map') {
      setMapOpen((prev) => !prev)
      setZukanOpen(false)
      return
    }
    if (button.id === 'book') {
      setZukanOpen(true)
      setMapOpen(false)
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
  const zukanRecords = buildZukanRecords(userAnimals)
  const unlockedCount = AREA_DEFS.filter((a) => isUnlocked(a.type)).length
  const placedCount = userAnimals.filter((a) => a.is_placed).length
  const activeType: AreaType = isUnlocked(currentType) ? currentType : FIRST_AREA
  const activeDef = AREA_DEFS.find((a) => a.type === activeType) ?? AREA_DEFS[0]
  const animalsHere = placedByArea[activeDef.type]
  const nextType: AreaType | null = AREA_ORDER[AREA_ORDER.indexOf(activeType) + 1] ?? null
  const nextDef = nextType ? AREA_DEFS.find((a) => a.type === nextType) : undefined

  // このエリアの動物の状況(スマホ・縦長の画面で、エリアの下に出す)
  const speciesStatus = (name: string): { known: boolean; text: string } => {
    const record = zukanRecords.get(name)
    if (!record || record.stages.size === 0) return { known: false, text: 'まだ出会っていない' }
    if (record.placedCount > 0) return { known: true, text: `動物園に ${record.placedCount} 匹` }
    if (record.adultCount > 0) return { known: true, text: '大人(動物園へ送れる)' }
    if (record.stages.has('CHILD')) return { known: true, text: '子供(育成中)' }
    return { known: true, text: '赤ちゃん(育成中)' }
  }

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
        <ZooPixiCanvas def={activeDef} animals={animalsHere} />

        {/* ===== まだ動物がいないエリアの案内 ===== */}
        {animalsHere.length === 0 && (
          <div className="zoo-panel zoo-empty">
            <p className="zoo-empty-title">まだ動物がいません</p>
            <p className="zoo-empty-text">
              タスクを完了して動物を大人に育て、
              <br />
              育成パネルの「動物園へ送る」で迎えましょう
            </p>
            <button className="zoo-btn zoo-empty-btn" onClick={() => router.push('/tasks')}>
              📋 タスクへ
            </button>
          </div>
        )}
      </div>

      {/* ===== PCより狭い画面: ユーザー情報とエリア名を1つにまとめた枠 ===== */}
      <div className="zoo-panel zoo-hud-bar">
        <div className="zoo-avatar">{userName.charAt(0)}</div>
        <div className="zoo-hud-bar-main">
          <p className="zoo-hud-bar-area">
            {activeDef.emoji} {areaName(activeDef)}
            <span className="zoo-area-sub">
              大人 {adultCount(activeDef.type)} / {SPECIES_PER_AREA} 種
            </span>
          </p>
          <p className="zoo-user-stat">
            {userName} ・ 🗺️ {unlockedCount}/4 エリア ・ 🐾 {placedCount}/12 匹
          </p>
        </div>
      </div>

      {/* ===== スマホ・縦長の画面: このエリアの動物の状況 ===== */}
      <div className="zoo-panel zoo-info">
        <p className="zoo-info-title">
          {activeDef.emoji} {areaName(activeDef)}の動物
        </p>
        <ul className="zoo-info-list">
          {activeDef.animals.map((animal) => {
            const status = speciesStatus(animal.name)
            const record = zukanRecords.get(animal.name)
            const shownStage = record?.stages.has('ADULT') ? 'ADULT' : record?.stages.has('CHILD') ? 'CHILD' : 'BABY'
            return (
              <li key={animal.name} className="zoo-info-row">
                <span className="zoo-info-icon">
                  <AnimalArt name={animal.name} stage={shownStage} discovered={status.known} playing={false} fit={90} />
                </span>
                <span className="zoo-info-name">{status.known ? animal.name : '？？？'}</span>
                <span className={`zoo-info-status${status.known ? '' : ' unknown'}`}>{status.text}</span>
              </li>
            )
          })}
        </ul>
        <p className="zoo-info-next">
          {!nextDef
            ? '🎉 すべてのエリアが開園しました'
            : isUnlocked(nextDef.type)
              ? `次のエリア ${nextDef.emoji}${areaName(nextDef)} は開園しています`
              : `あと ${Math.max(SPECIES_PER_AREA - adultCount(activeDef.type), 0)} 種を大人にすると ${nextDef.emoji}${areaName(nextDef)} が開園`}
        </p>
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
        <span className="zoo-area-sub">
          大人 {adultCount(activeDef.type)} / {SPECIES_PER_AREA} 種
        </span>
      </div>

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
            className={`zoo-btn zoo-menu-btn${(button.id === 'map' && mapOpen) || (button.id === 'book' && zukanOpen) ? ' active' : ''}`}
            onClick={() => handleMenu(button)}
          >
            <span className="zoo-menu-icon">{button.icon}</span>
            <span className="zoo-menu-label">{button.label}</span>
            {button.id === 'book' && zukanNewCount > 0 && (
              <span className="zoo-menu-badge" aria-label={`図鑑に新しい動物 ${zukanNewCount}`}>
                {zukanNewCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {notice && <div className="zoo-notice">{notice}</div>}

      {/* ===== 図鑑(画面の上に重ねて開く) ===== */}
      {zukanOpen && (
        <ZukanPanel
          userId={session?.user?.id}
          userAnimals={userAnimals}
          isUnlocked={isUnlocked}
          areaName={(type) => {
            const def = AREA_DEFS.find((a) => a.type === type)
            return def ? areaName(def) : type
          }}
          initialArea={activeType}
          onClose={() => setZukanOpen(false)}
        />
      )}

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
          position: relative;
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
        .zoo-menu-badge {
          position: absolute;
          top: -10px;
          right: -10px;
          min-width: 24px;
          padding: 2px 4px;
          font-size: 12px;
          font-weight: bold;
          color: #fff;
          background: #c0392b;
          border: 3px solid #0b0d17;
        }
        .zoo-menu-icon {
          font-size: 28px;
          line-height: 1;
        }
        .zoo-menu-label {
          font-size: 12px;
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
          /* ほかの枠(3000)より上に出す。縦長の画面では「このエリアの動物」の枠と重なり、
             並べ替え(order)の大きい枠が上に描かれるため、同じ値だと下に隠れてしまう */
          z-index: 3100;
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

        /* ---- まだ動物がいないエリアの案内 ---- */
        .zoo-empty {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          max-width: calc(100% - 32px);
          text-align: center;
          z-index: 2500;
        }
        .zoo-empty-title {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 8px;
        }
        .zoo-empty-text {
          font-size: 13px;
          line-height: 1.7;
          margin-bottom: 12px;
        }
        .zoo-empty-btn {
          font-size: 14px;
        }

        /* ---- 通知(準備中など) ---- */
        .zoo-notice {
          position: absolute;
          left: 50%;
          bottom: 130px;
          transform: translateX(-50%);
          max-width: calc(100% - 32px);
          background: #1e2235;
          border: 4px solid #f4e6b8;
          padding: 8px 16px;
          font-size: 14px;
          z-index: 3500;
        }

        /* ---- まとめた枠・動物の状況(PC では出さない) ---- */
        .zoo-hud-bar,
        .zoo-info {
          display: none;
        }
        .zoo-hud-bar {
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
        }
        .zoo-hud-bar .zoo-avatar {
          width: 44px;
          height: 44px;
          font-size: 22px;
          flex-shrink: 0;
        }
        .zoo-hud-bar-main {
          min-width: 0;
        }
        .zoo-hud-bar-area {
          display: flex;
          align-items: baseline;
          flex-wrap: wrap;
          gap: 4px 12px;
          font-size: 17px;
          font-weight: bold;
        }
        .zoo-info-title {
          font-size: 14px;
          font-weight: bold;
          margin-bottom: 8px;
        }
        .zoo-info-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .zoo-info-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 4px 8px;
          background: #2a2f48;
          border: 2px solid #0b0d17;
        }
        .zoo-info-icon {
          container-type: inline-size;
          width: 44px;
          height: 44px;
          flex-shrink: 0;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }
        .zoo-info-name {
          font-size: 14px;
          font-weight: bold;
          min-width: 4.5em;
        }
        .zoo-info-status {
          margin-left: auto;
          font-size: 12px;
          color: #7bd85a;
          text-align: right;
        }
        .zoo-info-status.unknown {
          color: #9a9fb8;
        }
        .zoo-info-next {
          margin-top: 10px;
          font-size: 12px;
          color: #ffe066;
        }

        /* ===== PC より狭い画面(1023px 以下): ユーザー情報とエリア名を1つの枠にまとめる ===== */
        @media (max-width: 1023px) {
          .zoo-hud-user,
          .zoo-area-title {
            display: none;
          }
          .zoo-hud-bar {
            display: flex;
            position: absolute;
            top: 16px;
            left: 16px;
            max-width: calc(100% - 32px);
          }
        }

        /* ===== スマホ(599px 以下)・縦長の画面: 上から順に並べる ===== */
        @media (max-width: 599px), (max-aspect-ratio: 1/1) {
          .zoo-stage {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 12px 12px 0;
          }
          .zoo-hud-bar {
            display: flex;
            position: relative;
            top: auto;
            left: auto;
            order: 1;
            flex: none;
          }
          /* エリア全体を横幅いっぱいに見せる(上下は少し切れてよい) */
          .zoo-scene {
            position: relative;
            inset: auto;
            order: 2;
            flex: none;
            width: 100%;
            aspect-ratio: 16 / 8.5;
            max-height: 55dvh;
            border: 4px solid #0b0d17;
          }
          .zoo-info {
            display: block;
            order: 3;
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
            padding: 10px 12px;
          }
          .zoo-menu {
            position: relative;
            right: auto;
            bottom: auto;
            order: 4;
            flex: none;
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 120px));
            justify-content: center;
            gap: 10px;
            padding: 4px 4px 14px;
          }
          .zoo-menu-btn {
            width: auto;
            height: 64px;
          }
          .zoo-menu-icon {
            font-size: 24px;
          }
          .zoo-map-panel {
            left: 12px;
            right: 12px;
            bottom: 96px;
            width: auto;
          }
          .zoo-notice {
            bottom: 96px;
          }
          /* エリアの中に出す案内は、小さくする */
          .zoo-empty {
            padding: 8px 10px;
          }
          .zoo-empty-title {
            font-size: 14px;
            margin-bottom: 4px;
          }
          .zoo-empty-text {
            font-size: 12px;
            line-height: 1.5;
            margin-bottom: 0;
          }
          .zoo-empty-btn {
            display: none; /* 下のメニューの「タスク」から行ける */
          }
        }

        /* ===== スマホ ===== */
        @media (max-width: 599px) {
          .zoo-hud-bar {
            max-width: none;
          }
        }
      `}</style>
    </div>
  )
}