/* ============================================================
 * スプライトシート(JSON + PNG)の読み込み
 *
 * 育成パネル(IkuseiView)と動物園(PixiJS)の両方で使う。
 * - JSON は scripts/sprites.mjs(npm run sprites)で作った形式を前提にしているが、
 *   ほかのツールで作った形式(frames が配列、meta がない、animations がない など)も読める
 * - 画像は、JSON の "image" に書かれた名前で、JSON と同じフォルダから読む
 * - content は「透明でない部分の範囲」(コマの中での位置)。
 *   画面ではこの範囲だけを切り出して表示するので、画像の余白が違っても、
 *   足元は箱の下端にそろい、大きさも contentSize() でそろえられる
 * ============================================================ */

export interface SpriteFrame {
  x: number
  y: number
  w: number
  h: number
  duration: number // このコマを表示する時間(ms)
}

export interface ContentBox {
  x: number
  y: number
  w: number
  h: number
}

export interface SpriteSheet {
  image: string // 画像のパス
  sheetW: number
  sheetH: number
  frames: SpriteFrame[] // 再生する順番に並べたコマ
  content: ContentBox // 透明でない部分の範囲(どのコマでも同じ位置)
  facing: 1 | -1 // 1: 右向きの絵 / -1: 左向きの絵
}

const DEFAULT_DURATION_MS = 100

type Rect = { x: number; y: number; w: number; h: number }
type RawFrame = Partial<Rect> & { frame?: Rect; duration?: number }

interface RawSheetJson {
  meta?: {
    image?: string
    size?: { w: number; h: number }
    facing?: string
    frameDurationMs?: number
    fps?: number
    contentBox?: ContentBox
  }
  image?: string // meta がない形式
  fps?: number
  sequence?: number[]
  frames?: Record<string, RawFrame> | RawFrame[]
  animations?: Record<string, number[]>
}

function toRect(raw: RawFrame): Rect | null {
  const r = raw.frame ?? raw
  if ([r.x, r.y, r.w, r.h].some((v) => typeof v !== 'number')) return null
  return { x: r.x as number, y: r.y as number, w: r.w as number, h: r.h as number }
}

// JSON の中身を、画面で使う形にそろえる
export function parseSpriteSheet(raw: RawSheetJson, jsonUrl: string): SpriteSheet {
  const meta = raw.meta ?? {}
  const imageName = meta.image ?? raw.image
  if (!imageName) throw new Error(`スプライトの JSON に image がありません: ${jsonUrl}`)

  const fps = meta.fps ?? raw.fps
  const fallbackDuration = meta.frameDurationMs ?? (fps ? 1000 / fps : DEFAULT_DURATION_MS)

  // コマを番号で引けるようにする
  const list: [string, RawFrame][] = Array.isArray(raw.frames)
    ? raw.frames.map((f, i) => [String(i), f])
    : Object.entries(raw.frames ?? {})
  const byKey = new Map(list)

  // 再生する順番: animations.default → animations.walk → 最初の animations → sequence → 番号順
  const animations = raw.animations ?? {}
  const order =
    animations.default ??
    animations.walk ??
    Object.values(animations)[0] ??
    raw.sequence ??
    list.map(([key]) => Number(key)).sort((a, b) => a - b)

  const frames: SpriteFrame[] = []
  for (const index of order) {
    const rawFrame = byKey.get(String(index))
    const rect = rawFrame && toRect(rawFrame)
    if (rect) frames.push({ ...rect, duration: rawFrame.duration ?? fallbackDuration })
  }
  if (frames.length === 0) throw new Error(`スプライトのコマがありません: ${jsonUrl}`)

  const first = frames[0]
  const sheetW = meta.size?.w ?? Math.max(...frames.map((f) => f.x + f.w))
  const sheetH = meta.size?.h ?? Math.max(...frames.map((f) => f.y + f.h))
  const box = meta.contentBox
  const content: ContentBox =
    box && box.w > 0 && box.h > 0 && box.x + box.w <= first.w && box.y + box.h <= first.h
      ? box
      : { x: 0, y: 0, w: first.w, h: first.h } // 範囲がわからないときは、コマ全体

  return {
    image: new URL(imageName, new URL(jsonUrl, window.location.href)).pathname,
    sheetW,
    sheetH,
    frames,
    content,
    facing: meta.facing === 'left' ? -1 : 1,
  }
}

// 同じファイルを何度も読み込まないように、読み込んだ結果を覚えておく
const sheetCache = new Map<string, Promise<SpriteSheet>>()

// JSON と画像を読み込む(画像の読み込みが終わってから返す)
export function loadSpriteSheet(jsonUrl: string): Promise<SpriteSheet> {
  const cached = sheetCache.get(jsonUrl)
  if (cached) return cached

  const promise = (async () => {
    const res = await fetch(jsonUrl)
    if (!res.ok) throw new Error(`スプライトの JSON がありません: ${jsonUrl}`)
    const sheet = parseSpriteSheet((await res.json()) as RawSheetJson, jsonUrl)
    await new Promise<void>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve()
      img.onerror = () => reject(new Error(`スプライトの画像がありません: ${sheet.image}`))
      img.src = sheet.image
    })
    return sheet
  })()

  // 失敗したときは覚えない(あとでファイルを置いたら、読み直せるように)
  promise.catch(() => sheetCache.delete(jsonUrl))
  sheetCache.set(jsonUrl, promise)
  return promise
}

// 絵の大きさ(透明でない部分の 横×縦 の平方根)。
// 細長いワニと背の高いキリンでも、見た目の大きさが同じくらいになるように、この値でそろえる
export function contentSize(sheet: SpriteSheet): number {
  return Math.sqrt(sheet.content.w * sheet.content.h)
}
