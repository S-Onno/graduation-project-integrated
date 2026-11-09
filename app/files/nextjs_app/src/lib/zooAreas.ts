/* ============================================================
 * 動物園のエリアと動物の定義
 *
 * 動物園画面(HTML 版の /zoo/map と、PixiJS 版)の両方で使う。
 * ============================================================ */

import type { ImageSize, WalkPoint } from '@/lib/zooWalk'

export type AreaType = 'JUNGLE' | 'SAVANNA' | 'SNOW' | 'WATER'

export interface AnimalDef {
  name: string
  emoji: string
  spriteJson?: string // スプライトのJSONファイルのパス(例: '/assets/sprites/crocodile/sprite-sheet.json')
  zoom?: number // スプライトの表示倍率。なければ SPRITE_ZOOM
  footPadding?: number // スプライト画像の下側の余白(元画像のpx)。なければ FOOT_PADDING
}

export interface AreaDef {
  type: AreaType
  name: string
  emoji: string
  unlockHint: string
  wallpaper?: string // 壁紙の画像。なければ fallback の色を使う
  wallpaperSize?: ImageSize // 壁紙の画像の大きさ(px)。wallpaper を指定するときは必須
  walkArea?: WalkPoint[] // 動物の足元が歩ける範囲(壁紙に対する%)。なければ DEFAULT_WALK_AREA
  fallback: string // 壁紙がないエリア用の背景(CSSのグラデーション)
  sunbeams?: boolean // PixiJS 版で、木漏れ日の演出を出す
  animals: AnimalDef[]
}

// ===== 動物の見た目・動きの設定 =====
export const SPRITE_ZOOM = 3 // スプライトを何倍にして表示するか(ドット絵なので整数がおすすめ)
export const FOOT_PADDING = 3 // スプライト画像の下側の余白(元画像のpx)。足元を地面に合わせるため
export const EMOJI_BOX = 32 // 絵文字で表示するときの大きさ(×SPRITE_ZOOM)
export const WALK_SPEED_PX = 60 // 歩く速さ(1秒あたりのpx)
export const COMMAND_SPEED_PX = 120 // タップで指示されたときの速さ(1秒あたりのpx)
export const COMMAND_PAUSE_MS = 5000 // 指示された場所に着いてから、また自由に歩き出すまでの時間
export const GATHER_RADIUS_PX = 110 // 集まるときの、タップした点からの距離(px)

// walkArea がないエリアで歩き回れる範囲(画面に対する%)
export const DEFAULT_WALK_AREA: WalkPoint[] = [
  { x: 8, y: 48 },
  { x: 92, y: 48 },
  { x: 92, y: 92 },
  { x: 8, y: 92 },
]

// ===== エリアと動物のデータ(4エリア × 3体) =====
export const AREA_DEFS: AreaDef[] = [
  {
    type: 'JUNGLE',
    sunbeams: true,
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
    sunbeams: true,
    name: 'サバンナ',
    emoji: '🌵',
    unlockHint: 'ジャングルで大人3匹育成',
    wallpaper: '/assets/areas/savanna/background.png',
    wallpaperSize: { w: 1376, h: 768 },
    // 木・茂み・岩を避けて、地面の部分を囲む(左上から時計回り)
    walkArea: [
      { x: 2.2, y: 41.7 },
      { x: 30.5, y: 39.7 },
      { x: 50.9, y: 37.1 },
      { x: 65.4, y: 35.2 },
      { x: 79.2, y: 41.7 },
      { x: 85.0, y: 44.9 },
      { x: 86.5, y: 61.2 },
      { x: 97.4, y: 65.1 },
      { x: 97.4, y: 74.9 },
      { x: 85.8, y: 80.7 },
      { x: 77.0, y: 88.5 },
      { x: 71.2, y: 96.4 },
      { x: 39.2, y: 97.0 },
      { x: 38.5, y: 88.5 },
      { x: 34.2, y: 80.7 },
      { x: 25.4, y: 74.2 },
      { x: 10.9, y: 67.1 },
      { x: 2.2, y: 65.8 },
    ],
    fallback: 'linear-gradient(#9fd4ff 0%, #9fd4ff 15%, #e7c867 15%, #d9b04a 100%)',
    animals: [
      { name: 'ライオン', emoji: '🦁' },
      {
        name: 'ゾウ',
        emoji: '🐘',
        spriteJson: '/assets/sprites/elephant/baby-walk.json',
        zoom: 1, // 1コマが128pxと大きいので等倍
        footPadding: 5,
      },
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
export const TEST_EXTRA_ANIMALS: Partial<Record<AreaType, AnimalDef[]>> = {
  SAVANNA: [
    {
      name: 'ワニ(テスト)',
      emoji: '🐊',
      spriteJson: '/assets/sprites/crocodile/sprite-sheet.json',
    },
  ],
}
