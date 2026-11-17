'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AREA_DEFS, AREA_ORDER, findAnimalDef, findAreaDef } from '@/lib/zooAreas'
import type { AreaType, Stage } from '@/lib/zooAreas'
import { fitWidth, frameStyle, useSpriteSheet } from '@/components/zoo/useSpriteSheet'

/* ============================================================
 * 動物図鑑(動物園の画面の上に重ねて開く)
 *
 * - エリアごとのページ。1ページは「3種 × 3段階(赤ちゃん・子供・大人)」の9マス
 * - 育てたことがある段階は絵、まだの段階はシルエット(同じ絵を黒くしたもの)
 *   成長段階は戻らないので、「その段階まで育てたか」は今の育成データから分かる(DB の変更なし)
 * - 絵は、歩くスプライトの最初のコマ。カーソルを合わせると歩くアニメーションが動く
 *   (スマホでは、マスを押して開く詳しい画面で動く)。スプライトがない段階は絵文字
 * - 新しく育てた段階には「NEW」を付ける。見たかどうかは、ブラウザ(localStorage)に保存する
 * ============================================================ */

// ===== 型 =====
export interface ZukanUserAnimal {
  stage: string
  is_placed: boolean
  acquired_at?: string
  animal: { name: string; area_type: string }
}

interface ZukanPanelProps {
  userId: string | undefined
  userAnimals: ZukanUserAnimal[]
  isUnlocked: (type: AreaType) => boolean // エリアが開園しているか(テスト用の切り替えに関係なく、本当の状態)
  areaName: (type: AreaType) => string
  initialArea: AreaType
  onClose: () => void
}

// 図鑑に書く、動物ごとの記録
interface AnimalRecord {
  stages: Set<Stage> // 育てたことがある段階
  firstMetAt: string | null // はじめて会った日
  adultCount: number // 大人まで育てた数
  placedCount: number // 動物園にいる数
}

const STAGES: Stage[] = ['BABY', 'CHILD', 'ADULT']
const STAGE_LABEL: Record<Stage, string> = { BABY: '赤ちゃん', CHILD: '子供', ADULT: '大人' }
const STAGE_RANK: Record<string, number> = { BABY: 0, CHILD: 1, ADULT: 2 }
const ENTRIES_PER_AREA = 9 // 3種 × 3段階
const TOTAL_ENTRIES = AREA_DEFS.length * ENTRIES_PER_AREA

// マスの中で、絵の長い辺がマスの何%になるか(大きく育つほど大きく描く)
const CARD_FIT: Record<Stage, number> = { BABY: 50, CHILD: 60, ADULT: 70 }

// 「NEW」の判定に使う、マスの名前(例: 'ゾウ:BABY')
export function entryKey(name: string, stage: Stage): string {
  return `${name}:${stage}`
}

// ===== 育成データから、図鑑の記録を作る =====
export function buildZukanRecords(userAnimals: ZukanUserAnimal[]): Map<string, AnimalRecord> {
  const records = new Map<string, AnimalRecord>()
  for (const userAnimal of userAnimals) {
    const name = userAnimal.animal.name
    const record = records.get(name) ?? { stages: new Set<Stage>(), firstMetAt: null, adultCount: 0, placedCount: 0 }
    const rank = STAGE_RANK[userAnimal.stage] ?? 0
    // 子供なら赤ちゃんも、大人なら赤ちゃん・子供も見たことになる
    STAGES.forEach((stage, i) => {
      if (i <= rank) record.stages.add(stage)
    })
    if (userAnimal.acquired_at && (!record.firstMetAt || userAnimal.acquired_at < record.firstMetAt)) {
      record.firstMetAt = userAnimal.acquired_at
    }
    if (userAnimal.stage === 'ADULT') record.adultCount++
    if (userAnimal.is_placed) record.placedCount++
    records.set(name, record)
  }
  return records
}

// エリアの9マスの名前
function areaKeys(type: AreaType): string[] {
  return (findAreaDef(type)?.animals ?? []).flatMap((a) => STAGES.map((stage) => entryKey(a.name, stage)))
}

// 育てたことがあるマスの名前の一覧
export function discoveredKeys(records: Map<string, AnimalRecord>): string[] {
  const keys: string[] = []
  for (const [name, record] of records) {
    for (const stage of record.stages) keys.push(entryKey(name, stage))
  }
  return keys
}

// ===== 「NEW」: 図鑑で見たマスを、ブラウザに保存する =====
const SEEN_EVENT = 'zootask-zukan-seen'

function seenStorageKey(userId: string): string {
  return `zootask:zukan-seen:${userId}`
}

function subscribeSeen(callback: () => void): () => void {
  window.addEventListener('storage', callback)
  window.addEventListener(SEEN_EVENT, callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(SEEN_EVENT, callback)
  }
}

export function useZukanSeen(userId: string | undefined) {
  const storageKey = userId ? seenStorageKey(userId) : null
  // 保存されている文字列をそのまま読む(サーバーでの描画中は null)
  const raw = useSyncExternalStore(
    subscribeSeen,
    () => {
      if (!storageKey) return null
      try {
        return window.localStorage.getItem(storageKey)
      } catch {
        return null // 保存が使えない環境(プライベートモードなど)
      }
    },
    () => null,
  )

  const seen = useMemo(() => {
    try {
      const list: unknown = raw ? JSON.parse(raw) : []
      return new Set(Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : [])
    } catch {
      return new Set<string>()
    }
  }, [raw])

  const markSeen = useCallback(
    (keys: string[]) => {
      if (!storageKey) return
      const next = new Set(seen)
      let changed = false
      for (const key of keys) {
        if (!next.has(key)) {
          next.add(key)
          changed = true
        }
      }
      if (!changed) return
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]))
        window.dispatchEvent(new Event(SEEN_EVENT))
      } catch {
        // 保存できなくても、図鑑はそのまま使える(「NEW」が消えないだけ)
      }
    },
    [storageKey, seen],
  )

  return { seen, markSeen }
}

// ===== 動物の絵(静止画。playing のときだけ歩くアニメーション) =====
function AnimalArt({
  name,
  stage,
  discovered,
  playing,
  fit,
}: {
  name: string
  stage: Stage
  discovered: boolean
  playing: boolean
  fit: number // 絵の長い辺が、枠の何%になるか
}) {
  const jsonUrl = findAnimalDef(name)?.sprites?.[stage]?.walk
  const state = useSpriteSheet(jsonUrl)
  const sheet = state.status === 'ready' ? state.sheet : null
  const frameRef = useRef<HTMLDivElement>(null)

  // カーソルを合わせている間だけ、コマを進める(動きを減らす設定の人には動かさない)
  useEffect(() => {
    if (!sheet || !playing || !discovered) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = frameRef.current
    if (!el) return
    let index = 0
    let timer = 0
    const step = () => {
      index = (index + 1) % sheet.frames.length
      const frame = sheet.frames[index]
      Object.assign(el.style, frameStyle(sheet, frame, fitWidth(sheet, fit)))
      timer = window.setTimeout(step, frame.duration)
    }
    timer = window.setTimeout(step, sheet.frames[0].duration)
    return () => {
      window.clearTimeout(timer)
      // 止めたら、最初のコマに戻す
      Object.assign(el.style, frameStyle(sheet, sheet.frames[0], fitWidth(sheet, fit)))
    }
  }, [sheet, playing, discovered, fit])

  const label = discovered ? `${name}(${STAGE_LABEL[stage]})` : 'まだ育てていない動物'
  if (sheet) {
    return (
      <div
        ref={frameRef}
        className={`zk-art zk-sprite${discovered ? '' : ' zk-silhouette'}`}
        style={frameStyle(sheet, sheet.frames[0], fitWidth(sheet, fit))}
        role="img"
        aria-label={label}
      />
    )
  }
  if (state.status === 'loading') return <div className="zk-art" style={{ width: `${fit}cqw` }} />
  return (
    <span
      className={`zk-art zk-emoji${discovered ? '' : ' zk-silhouette'}`}
      style={{ fontSize: `${fit * 0.62}cqw` }}
      role="img"
      aria-label={label}
    >
      {findAnimalDef(name)?.emoji ?? '🐾'}
    </span>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

// ===== 図鑑本体 =====
export function ZukanPanel({ userId, userAnimals, isUnlocked, areaName, initialArea, onClose }: ZukanPanelProps) {
  const [areaType, setAreaType] = useState<AreaType>(initialArea)
  const [hovered, setHovered] = useState<string | null>(null) // カーソルを合わせているマス
  const [detail, setDetail] = useState<{ name: string; stage: Stage; wasNew: boolean } | null>(null)
  const { seen, markSeen } = useZukanSeen(userId)

  const records = useMemo(() => buildZukanRecords(userAnimals), [userAnimals])
  const allDiscovered = useMemo(() => discoveredKeys(records), [records])
  const isDiscovered = (name: string, stage: Stage) => records.get(name)?.stages.has(stage) ?? false
  const isNew = (name: string, stage: Stage) => isDiscovered(name, stage) && !seen.has(entryKey(name, stage))

  const areaDef = findAreaDef(areaType) ?? AREA_DEFS[0]
  const areaCount = (type: AreaType) => areaKeys(type).filter((key) => allDiscovered.includes(key)).length
  const areaHasNew = (type: AreaType) => areaKeys(type).some((key) => allDiscovered.includes(key) && !seen.has(key))
  const unlocked = isUnlocked(areaType)
  const complete = areaCount(areaType) === ENTRIES_PER_AREA

  // 見ていたエリアの「NEW」を消す(見ている間は NEW のまま。エリアを変えたとき・閉じたときに消す)
  const markAreaSeen = useCallback(() => {
    markSeen(areaKeys(areaType).filter((key) => allDiscovered.includes(key)))
  }, [markSeen, areaType, allDiscovered])

  const handleClose = useCallback(() => {
    markAreaSeen()
    onClose()
  }, [markAreaSeen, onClose])

  const handleTab = (type: AreaType) => {
    if (type === areaType) return
    markAreaSeen()
    setAreaType(type)
    setHovered(null)
  }

  const openDetail = (name: string, stage: Stage) => {
    if (!isDiscovered(name, stage)) return
    setDetail({ name, stage, wasNew: isNew(name, stage) })
    markSeen([entryKey(name, stage)])
  }

  // Esc キーで、詳しい画面 → 図鑑の順に閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (detail) setDetail(null)
      else handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detail, handleClose])

  const detailRecord = detail ? records.get(detail.name) : undefined

  return (
    <div className="zk-backdrop" onClick={handleClose}>
      <section
        className="zoo-panel zk-panel"
        role="dialog"
        aria-modal="true"
        aria-label="動物図鑑"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===== 見出し ===== */}
        <header className="zk-head">
          <h2 className="zk-title">📖 どうぶつ図鑑</h2>
          <span className="zk-total">
            ぜんぶ {allDiscovered.length} / {TOTAL_ENTRIES}
          </span>
          <button className="zoo-btn zk-close" onClick={handleClose} aria-label="図鑑を閉じる">
            ✕
          </button>
        </header>

        {/* ===== エリアのタブ(開園する順番) ===== */}
        <div className="zk-tabs" role="tablist">
          {AREA_ORDER.map((type) => {
            const def = findAreaDef(type)
            if (!def) return null
            const open = isUnlocked(type)
            return (
              <button
                key={type}
                role="tab"
                aria-selected={type === areaType}
                className={`zk-tab${type === areaType ? ' current' : ''}${open ? '' : ' locked'}`}
                onClick={() => handleTab(type)}
              >
                <span className="zk-tab-icon">{open ? def.emoji : '🔒'}</span>
                <span className="zk-tab-name">{areaName(type)}</span>
                <span className="zk-tab-count">
                  {areaCount(type)}/{ENTRIES_PER_AREA}
                </span>
                {areaHasNew(type) && <span className="zk-dot" aria-label="新しい動物あり" />}
              </button>
            )
          })}
        </div>

        {/* ===== エリアのページ ===== */}
        <div className="zk-page">
          {!unlocked && (
            <p className="zk-locked">
              🔒 まだ開園していません — {areaDef.unlockHint}
            </p>
          )}

          <div className="zk-grid">
            <span />
            {STAGES.map((stage) => (
              <span key={stage} className="zk-col-head">
                {STAGE_LABEL[stage]}
              </span>
            ))}

            {areaDef.animals.map((animal) => {
              const known = (records.get(animal.name)?.stages.size ?? 0) > 0
              return [
                <span key={`${animal.name}-name`} className="zk-row-head">
                  {known ? animal.name : '？？？'}
                </span>,
                ...STAGES.map((stage) => {
                  const key = entryKey(animal.name, stage)
                  const discovered = isDiscovered(animal.name, stage)
                  return (
                    <button
                      key={key}
                      className={`zk-card${discovered ? ' found' : ''}`}
                      onClick={() => openDetail(animal.name, stage)}
                      onMouseEnter={() => setHovered(key)}
                      onMouseLeave={() => setHovered((prev) => (prev === key ? null : prev))}
                      onFocus={() => setHovered(key)}
                      onBlur={() => setHovered((prev) => (prev === key ? null : prev))}
                      disabled={!discovered}
                      aria-label={discovered ? `${animal.name} ${STAGE_LABEL[stage]}` : `まだ育てていない(${STAGE_LABEL[stage]})`}
                    >
                      <span className="zk-card-art">
                        <AnimalArt
                          name={animal.name}
                          stage={stage}
                          discovered={discovered}
                          playing={hovered === key}
                          fit={CARD_FIT[stage]}
                        />
                      </span>
                      <span className="zk-card-name">{discovered ? animal.name : '？？？'}</span>
                      {isNew(animal.name, stage) && <span className="zk-new">NEW</span>}
                    </button>
                  )
                }),
              ]
            })}
          </div>

          <div className="zk-progress">
            {complete && (
              <span className="zk-stamp" aria-label="コンプリート">
                COMPLETE
              </span>
            )}
            <span className="zk-progress-text">
              {areaDef.emoji} {areaName(areaType)} {areaCount(areaType)} / {ENTRIES_PER_AREA}
            </span>
          </div>
        </div>

        {/* ===== 詳しい画面 ===== */}
        {detail && (
          <div className="zk-detail-backdrop" onClick={() => setDetail(null)}>
            <div className="zoo-panel zk-detail" onClick={(e) => e.stopPropagation()}>
              <button className="zoo-btn zk-close" onClick={() => setDetail(null)} aria-label="詳しい画面を閉じる">
                ✕
              </button>
              <div className="zk-detail-stage" style={{ background: areaDef.fallback }}>
                <AnimalArt key={`${detail.name}-${detail.stage}`} name={detail.name} stage={detail.stage} discovered playing fit={70} />
                {detail.wasNew && <span className="zk-new zk-new-big">NEW!</span>}
              </div>
              <p className="zk-detail-name">{detail.name}</p>
              <p className="zk-detail-sub">
                {areaDef.emoji} {areaName(areaType)}
              </p>

              {/* 段階の切り替え */}
              <div className="zk-stage-tabs">
                {STAGES.map((stage) => {
                  const found = isDiscovered(detail.name, stage)
                  return (
                    <button
                      key={stage}
                      className={`zoo-btn zk-stage-btn${stage === detail.stage ? ' current' : ''}`}
                      onClick={() => openDetail(detail.name, stage)}
                      disabled={!found}
                    >
                      {found ? STAGE_LABEL[stage] : '？？？'}
                    </button>
                  )
                })}
              </div>

              <dl className="zk-facts">
                <dt>はじめて会った日</dt>
                <dd>{formatDate(detailRecord?.firstMetAt ?? null)}</dd>
                <dt>大人まで育てた数</dt>
                <dd>{detailRecord?.adultCount ?? 0} 匹</dd>
                <dt>動物園にいる数</dt>
                <dd>{detailRecord?.placedCount ?? 0} 匹</dd>
              </dl>
            </div>
          </div>
        )}
      </section>

      <style jsx global>{`
        /* ---- 背景(動物園を暗くする) ---- */
        .zk-backdrop {
          position: absolute;
          inset: 0;
          z-index: 4000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: rgba(11, 13, 23, 0.6);
          animation: zk-fade 0.2s ease-out;
        }
        @keyframes zk-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .zk-panel {
          position: relative;
          width: min(600px, 100%);
          max-height: 100%;
          overflow-y: auto;
          padding: 16px 18px 20px;
        }

        /* ---- 見出し ---- */
        .zk-head {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        .zk-title {
          font-size: 20px;
          font-weight: bold;
        }
        .zk-total {
          margin-left: auto;
          font-size: 13px;
          color: #ffe066;
        }
        .zk-close {
          padding: 4px 10px;
          font-size: 14px;
        }

        /* ---- タブ ---- */
        .zk-tabs {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-bottom: 14px;
        }
        .zk-tab {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 6px 4px;
          font-family: inherit;
          color: #1e2235;
          background: #f4e6b8;
          border: 3px solid #0b0d17;
          box-shadow: inset -3px -3px 0 #c9b273;
          cursor: pointer;
        }
        .zk-tab:hover {
          background: #fff2c6;
        }
        .zk-tab.current {
          background: #ffe066;
          border-color: #c0392b;
        }
        .zk-tab.locked {
          background: #6b6f87;
          color: #e6e1cc;
          box-shadow: inset -3px -3px 0 #4e5169;
        }
        .zk-tab-icon {
          font-size: 20px;
          line-height: 1;
        }
        .zk-tab-name {
          font-size: 12px;
          font-weight: bold;
        }
        .zk-tab-count {
          font-size: 11px;
        }
        .zk-dot {
          position: absolute;
          top: -6px;
          right: -6px;
          width: 14px;
          height: 14px;
          background: #c0392b;
          border: 2px solid #0b0d17;
        }

        /* ---- ページ ---- */
        .zk-page {
          position: relative;
        }
        .zk-locked {
          margin-bottom: 10px;
          padding: 6px 10px;
          font-size: 12px;
          background: #2a2f48;
          border: 2px solid #0b0d17;
        }
        .zk-grid {
          display: grid;
          grid-template-columns: auto repeat(3, 1fr);
          gap: 8px;
          align-items: center;
        }
        .zk-col-head {
          font-size: 12px;
          text-align: center;
          color: #ffe066;
        }
        .zk-row-head {
          writing-mode: vertical-rl;
          font-size: 13px;
          font-weight: bold;
          letter-spacing: 0.1em;
          justify-self: center;
        }

        /* マス */
        .zk-card {
          position: relative;
          container-type: inline-size;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 4px 4px 6px;
          font-family: inherit;
          color: #f4e6b8;
          background: #2a2f48;
          border: 3px solid #0b0d17;
          box-shadow: inset -3px -3px 0 #1a1d2e;
        }
        .zk-card.found {
          background: #f4e6b8;
          color: #1e2235;
          box-shadow: inset -3px -3px 0 #c9b273, 3px 3px 0 #0b0d17;
          cursor: pointer;
        }
        .zk-card.found:hover,
        .zk-card.found:focus-visible {
          background: #fff2c6;
          outline: none;
          border-color: #c0392b;
        }
        .zk-card:disabled {
          cursor: default;
        }
        .zk-card-art {
          width: 100%;
          aspect-ratio: 5 / 4;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding-bottom: 6%;
        }
        .zk-art {
          display: block;
          image-rendering: pixelated;
        }
        .zk-sprite {
          background-repeat: no-repeat;
        }
        .zk-emoji {
          line-height: 1;
        }
        /* まだ育てていない段階: 同じ絵を真っ黒にしてシルエットにする */
        .zk-silhouette {
          filter: brightness(0);
          opacity: 0.55;
        }
        .zk-card-name {
          font-size: 11px;
          font-weight: bold;
        }
        .zk-new {
          position: absolute;
          top: -8px;
          left: -6px;
          padding: 1px 5px;
          font-size: 10px;
          font-weight: bold;
          color: #fff;
          background: #c0392b;
          border: 2px solid #0b0d17;
          animation: zk-blink 0.8s steps(2) infinite;
        }
        @keyframes zk-blink {
          0% {
            opacity: 1;
          }
          100% {
            opacity: 0.65;
          }
        }
        .zk-progress {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 14px;
          min-height: 36px;
          font-size: 13px;
        }
        .zk-progress-text {
          margin-left: auto;
        }
        .zk-stamp {
          padding: 2px 10px;
          font-size: 18px;
          font-weight: bold;
          letter-spacing: 0.08em;
          color: #c0392b;
          border: 4px double #c0392b;
          transform: rotate(-14deg);
          opacity: 0.85;
          pointer-events: none;
          animation: zk-stamp 0.4s ease-out;
        }
        @keyframes zk-stamp {
          from {
            transform: rotate(-14deg) scale(2);
            opacity: 0;
          }
          to {
            transform: rotate(-14deg) scale(1);
            opacity: 0.85;
          }
        }

        /* ---- 詳しい画面 ---- */
        .zk-detail-backdrop {
          position: absolute;
          inset: 0;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
          background: rgba(11, 13, 23, 0.55);
        }
        .zk-detail {
          position: relative;
          width: min(340px, 100%);
          text-align: center;
        }
        .zk-detail .zk-close {
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 1;
        }
        .zk-detail-stage {
          position: relative;
          container-type: inline-size;
          aspect-ratio: 1 / 1;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding-bottom: 10%;
          margin-bottom: 10px;
          border: 3px solid #0b0d17;
        }
        .zk-new-big {
          top: 8px;
          left: 8px;
          font-size: 13px;
        }
        .zk-detail-name {
          font-size: 20px;
          font-weight: bold;
        }
        .zk-detail-sub {
          font-size: 12px;
          margin-bottom: 10px;
        }
        .zk-stage-tabs {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-bottom: 12px;
        }
        .zk-stage-btn {
          padding: 4px 8px;
          font-size: 12px;
        }
        .zk-stage-btn.current {
          background: #ffe066;
        }
        .zk-stage-btn:disabled {
          background: #6b6f87;
          cursor: default;
        }
        .zk-facts {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 4px 12px;
          font-size: 12px;
          text-align: left;
        }
        .zk-facts dt {
          color: #ffe066;
        }
        .zk-facts dd {
          text-align: right;
        }

        /* ---- スマホ ---- */
        @media (max-width: 480px) {
          .zk-backdrop {
            padding: 8px;
          }
          .zk-panel {
            padding: 12px;
          }
          .zk-title {
            font-size: 16px;
          }
          .zk-tab-name {
            font-size: 10px;
          }
          .zk-grid {
            gap: 6px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .zk-backdrop,
          .zk-new,
          .zk-stamp {
            animation: none;
          }
        }
      `}</style>
    </div>
  )
}
