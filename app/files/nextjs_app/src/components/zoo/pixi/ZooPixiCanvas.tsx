'use client'

import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { ZooPixiScene } from './ZooPixiScene'
import type { ZooPixiStats } from './ZooPixiScene'
import type { AnimalDef, AreaDef } from '@/lib/zooAreas'

// 親(ZooScreen)から PixiJS の演出を呼び出すための操作
export interface ZooPixiControl {
  playGrowth: (name?: string) => void // 成長したときの光の柱
}

// PixiJS の画面を置く入れ物。描画と動きは ZooPixiScene に任せる
export default function ZooPixiCanvas({
  def,
  animals,
  showStats = false,
  controlRef,
}: {
  def: AreaDef
  animals: AnimalDef[]
  showStats?: boolean // 左下に fps と粒子の数を出す(移行中の確認用)
  controlRef?: RefObject<ZooPixiControl | null>
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [stats, setStats] = useState<ZooPixiStats | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new ZooPixiScene(host, def, animals, showStats ? setStats : undefined)
    scene.init().catch((error) => console.error('PixiJS の起動に失敗しました', error))
    if (controlRef) controlRef.current = { playGrowth: (name) => scene.playGrowth(name) }
    // テスト用: URL に ?pixiDebug を付けたときだけ、ブラウザから状態を読めるようにする
    const debug = new URLSearchParams(window.location.search).has('pixiDebug')
    const debugWindow = window as Window & { __zooPixi?: ZooPixiScene }
    if (debug) debugWindow.__zooPixi = scene
    return () => {
      if (controlRef) controlRef.current = null
      if (debug && debugWindow.__zooPixi === scene) delete debugWindow.__zooPixi
      scene.destroy()
    }
  }, [def, animals, showStats, controlRef])

  return (
    <>
      {/* touch-action: none で、タップ中にブラウザがスクロールや拡大をしないようにする */}
      <div
        ref={hostRef}
        style={{ position: 'absolute', inset: 0, zIndex: 1, touchAction: 'none' }}
      />
      {showStats && (
        <div
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            zIndex: 2,
            padding: '4px 8px',
            background: 'rgba(11, 13, 23, 0.75)',
            color: '#f4e6b8',
            fontSize: 12,
            lineHeight: 1.5,
            pointerEvents: 'none',
          }}
        >
          PixiJS FPS: {stats?.fps ?? '-'} / 粒子: {stats?.particles ?? 0}
        </div>
      )}
    </>
  )
}
