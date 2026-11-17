/* ============================================================
 * 動物園のエリアと動物の定義
 *
 * 動物園画面(PixiJS 版)と、育成パネルの両方で使う。
 * ============================================================ */

import type { ImageSize, WalkPoint } from '@/lib/zooWalk'
import { SPRITE_MANIFEST } from '@/lib/spriteManifest'

export type AreaType = 'JUNGLE' | 'SAVANNA' | 'SNOW' | 'WATER'
export type Stage = 'BABY' | 'CHILD' | 'ADULT'

// 成長段階1つ分のスプライト(JSON のパス。PNG は JSON の "image" の名前で、同じフォルダから読む)
export interface SpriteDef {
  walk: string // 歩くアニメーション
  idle?: string // 止まっているときのアニメーション。なければ walk の最初のコマで止まる
}

export interface AnimalDef {
  name: string
  emoji: string
  slug?: string // スプライトのフォルダ名(public/sprites/animals/<slug>/)
  scale?: number // 大きさの倍率(1 が標準)。ゾウを大きめにする、などの調整用
  sprites?: Partial<Record<Stage, SpriteDef>> // 成長段階ごとのスプライト。ない段階は絵文字で表示する
  zooSprite?: SpriteDef // 動物園(PixiJS)で歩かせるスプライト。zooAnimalDef() が sprites.ADULT から作る
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

// ===== エリアが開園する順番(サーバーの src/lib/game.ts でも使う) =====
// 最初はサバンナだけが開園していて、大人が3匹そろうと次のエリアが開園する
export const AREA_ORDER: AreaType[] = ['SAVANNA', 'JUNGLE', 'SNOW', 'WATER']
export const FIRST_AREA: AreaType = AREA_ORDER[0]
export const ADULTS_TO_UNLOCK = 3 // 次のエリアが開園するのに必要な、大人の数

// ===== 動物の見た目・動きの設定 =====
// 動物園での動物の大きさ(px)。絵の 横×縦 の平方根がこの値になるように拡大・縮小する
// (元の画像の大きさは 128px〜335px とばらばらなので、倍率ではなく、表示する大きさで決める)
export const ZOO_SPRITE_SIZE = 130
export const EMOJI_BOX = 96 // 絵文字で表示するときの大きさ(px)
export const WALK_SPEED_PX = 60 // 歩く速さ(1秒あたりのpx)
export const COMMAND_SPEED_PX = 120 // タップで指示されたときの速さ(1秒あたりのpx)
export const COMMAND_PAUSE_MS = 5000 // 指示された場所に着いてから、また自由に歩き出すまでの時間
export const GATHER_RADIUS_PX = 110 // 集まるときの、タップした点からの距離(px)

// ===== スプライトの置き場所 =====
// public/sprites/animals/<slug>/<段階>-<動作>.png と、同じ名前の .json
// ファイルを置いたら npm run sprites を実行する(JSON と src/lib/spriteManifest.ts が更新される)
export const SPRITE_ROOT = '/sprites/animals'

const STAGE_FILE_PREFIX: Record<Stage, string> = { BABY: 'baby', CHILD: 'child', ADULT: 'adult' }

export function spritePath(slug: string, stage: Stage, action: string): string {
  return `${SPRITE_ROOT}/${slug}/${STAGE_FILE_PREFIX[stage]}-${action}.json`
}

// spriteManifest.ts を見て、ファイルがある段階だけスプライトを登録する
function spritesFor(slug: string): Partial<Record<Stage, SpriteDef>> {
  const sprites: Partial<Record<Stage, SpriteDef>> = {}
  for (const stage of ['BABY', 'CHILD', 'ADULT'] as const) {
    const actions = SPRITE_MANIFEST[slug]?.[stage] ?? []
    if (!actions.includes('walk')) continue
    sprites[stage] = {
      walk: spritePath(slug, stage, 'walk'),
      idle: actions.includes('idle') ? spritePath(slug, stage, 'idle') : undefined,
    }
  }
  return sprites
}

// 動物の定義を作る(slug のフォルダにあるスプライトを自動で登録する)
function animal(name: string, emoji: string, slug: string, options: { scale?: number } = {}): AnimalDef {
  return { name, emoji, slug, scale: options.scale, sprites: spritesFor(slug) }
}

// walkArea がないエリアで歩き回れる範囲(画面に対する%)
export const DEFAULT_WALK_AREA: WalkPoint[] = [
  { x: 8, y: 48 },
  { x: 92, y: 48 },
  { x: 92, y: 92 },
  { x: 8, y: 92 },
]

// ===== エリアと動物のデータ(4エリア × 3体、開園する順番に並べる) =====
export const AREA_DEFS: AreaDef[] = [
  {
    type: 'SAVANNA',
    sunbeams: true,
    name: 'サバンナ',
    emoji: '🌵',
    unlockHint: '最初から開園しています',
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
      animal('ライオン', '🦁', 'lion'),
      animal('ゾウ', '🐘', 'elephant', { scale: 1.15 }),
      animal('キリン', '🦒', 'giraffe', { scale: 1.1 }),
    ],
  },
  {
    type: 'JUNGLE',
    sunbeams: true,
    name: 'ジャングル',
    emoji: '🌿',
    unlockHint: 'サバンナで大人を3匹育てると開園',
    fallback: 'linear-gradient(#86d0a8 0%, #86d0a8 18%, #3f9b4a 18%, #2b6e34 100%)',
    animals: [
      animal('ゴリラ', '🦍', 'gorilla'),
      animal('オウム', '🦜', 'parrot'),
      animal('サル', '🐒', 'monkey'),
    ],
  },
  {
    type: 'SNOW',
    name: '雪',
    emoji: '❄️',
    unlockHint: 'ジャングルで大人を3匹育てると開園',
    fallback: 'linear-gradient(#bfe3ff 0%, #bfe3ff 20%, #eaf4ff 20%, #cfe3f5 100%)',
    animals: [
      animal('シロクマ', '🐻‍❄️', 'polar-bear'),
      animal('ペンギン', '🐧', 'penguin'),
      animal('アザラシ', '🦭', 'seal'),
    ],
  },
  {
    type: 'WATER',
    name: '水',
    emoji: '🌊',
    unlockHint: '雪で大人を3匹育てると開園',
    fallback: 'linear-gradient(#9fd4ff 0%, #9fd4ff 18%, #4f9fe0 18%, #2f6fb0 100%)',
    animals: [
      animal('カバ', '🦛', 'hippo'),
      animal('ワニ', '🐊', 'crocodile'), // swim のスプライトもあるが、今は walk だけ使う
      animal('フラミンゴ', '🦩', 'flamingo'),
    ],
  },
]

// ===== 探すための関数 =====
export function findAreaDef(type: AreaType): AreaDef | undefined {
  return AREA_DEFS.find((a) => a.type === type)
}

export function findAnimalDef(name: string): AnimalDef | undefined {
  for (const area of AREA_DEFS) {
    const found = area.animals.find((a) => a.name === name)
    if (found) return found
  }
  return undefined
}

// 動物園(PixiJS)で歩かせる設定を作る。動物園にいるのは大人なので、大人のスプライトを使う
export function zooAnimalDef(def: AnimalDef): AnimalDef {
  const adult = def.sprites?.ADULT
  if (!adult) return def
  return { ...def, zooSprite: adult }
}
