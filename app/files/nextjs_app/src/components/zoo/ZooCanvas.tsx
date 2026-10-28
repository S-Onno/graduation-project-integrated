'use client'

import { useEffect, useRef } from 'react'
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js'

interface Placement {
  id: string
  pos_x: number
  pos_y: number
  area_type: string
  userAnimal: {
    animal: { name: string }
  }
}

const ANIMAL_EMOJI: Record<string, string> = {
  ゴリラ: '🦍', オウム: '🦜', サル: '🐒',
  ライオン: '🦁', ゾウ: '🐘', キリン: '🦒',
  シロクマ: '🐻‍❄️', ペンギン: '🐧', アザラシ: '🦭',
  カバ: '🦛', ワニ: '🐊', フラミンゴ: '🦩',
}

const AREA_COLORS: Record<string, number> = {
  JUNGLE:  0x1a3a1a,
  SAVANNA: 0x3a2a0a,
  SNOW:    0x1a2a3a,
  WATER:   0x0a1a3a,
}

const AREA_LABELS: Record<string, string> = {
  JUNGLE: '🌿 ジャングル', SAVANNA: '🌵 サバンナ',
  SNOW: '❄️ 雪', WATER: '🌊 水',
}

interface Props {
  placements: Placement[]
  onPlacementMove?: (id: string, x: number, y: number) => void
}

export function ZooCanvas({ placements, onPlacementMove }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    const app = new Application()
    appRef.current = app

    const AREA_W = 320
    const AREA_H = 400
    const areas = ['JUNGLE', 'SAVANNA', 'SNOW', 'WATER']

    app.init({
      width: AREA_W * areas.length,
      height: AREA_H,
      backgroundColor: 0x0f0f1a,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    }).then(() => {
      if (!canvasRef.current) return
      canvasRef.current.appendChild(app.canvas)

      areas.forEach((area, i) => {
        const container = new Container()
        container.x = i * AREA_W
        app.stage.addChild(container)

        // エリア背景
        const bg = new Graphics()
        bg.rect(4, 4, AREA_W - 8, AREA_H - 8)
        bg.fill({ color: AREA_COLORS[area] })
        bg.stroke({ color: 0x3d3d6e, width: 2 })
        container.addChild(bg)

        // エリアラベル
        const labelStyle = new TextStyle({ fill: 0xf1f5f9, fontSize: 14, fontFamily: 'sans-serif' })
        const label = new Text({ text: AREA_LABELS[area], style: labelStyle })
        label.x = 12
        label.y = 12
        container.addChild(label)

        // 配置済み動物を描画
        const areaAnimals = placements.filter(p => p.area_type === area)
        areaAnimals.forEach(p => {
          const emoji = ANIMAL_EMOJI[p.userAnimal.animal.name] ?? '🐾'
          const emojiStyle = new TextStyle({ fontSize: 32, fontFamily: 'sans-serif' })
          const emojiText = new Text({ text: emoji, style: emojiStyle })
          emojiText.x = p.pos_x - i * AREA_W - 16
          emojiText.y = p.pos_y - 16
          emojiText.interactive = true
          emojiText.cursor = 'grab'

          let dragging = false
          let dragOffsetX = 0
          let dragOffsetY = 0

          emojiText.on('pointerdown', (e) => {
            dragging = true
            dragOffsetX = e.global.x - (emojiText.x + i * AREA_W)
            dragOffsetY = e.global.y - emojiText.y
          })
          emojiText.on('pointermove', (e) => {
            if (!dragging) return
            emojiText.x = e.global.x - dragOffsetX - i * AREA_W
            emojiText.y = e.global.y - dragOffsetY
          })
          emojiText.on('pointerup', () => {
            if (!dragging) return
            dragging = false
            onPlacementMove?.(p.id, emojiText.x + i * AREA_W, emojiText.y)
          })

          const nameStyle = new TextStyle({ fill: 0x94a3b8, fontSize: 10, fontFamily: 'sans-serif' })
          const nameText = new Text({ text: p.userAnimal.animal.name, style: nameStyle })
          nameText.x = emojiText.x - 4
          nameText.y = emojiText.y + 36

          container.addChild(emojiText)
          container.addChild(nameText)
        })
      })
    })

    return () => {
      app.destroy(true, { children: true })
    }
  }, [placements, onPlacementMove])

  return (
    <div
      ref={canvasRef}
      style={{
        overflowX: 'auto',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
      }}
    />
  )
}
