/* ============================================================
 * 動物のスプライト(public/sprites/animals/)を整えるスクリプト
 *
 *   npm run sprites         … PNG から JSON を作り直し、src/lib/spriteManifest.ts を更新する
 *   npm run sprites:check   … 予定のファイル構成と比べて、足りないファイルを表で出す(何も書き換えない)
 *
 * - 置くファイルは public/sprites/animals/<動物>/<段階>-<動作>.png
 *   (例: elephant/baby-walk.png、crocodile/adult-swim.png)
 * - JSON は PNG から自動で作るので、手で用意しなくてよい。
 *   - コマの並びは 4×4(16コマ)とみなす。違うときは、同じ名前の JSON に
 *     "meta": { "layout": { "cols": 4, "rows": 3 } } のように書いておくと、それを使う
 *   - 1コマの時間は、同じ名前の JSON にある値(meta.frameDurationMs か、frames の duration)を使う。
 *     なければ DEFAULT_DURATION_MS
 *   - meta.contentBox に「透明でない部分の範囲」を書く。
 *     画面では、これを使って動物の大きさと足元の位置をそろえる
 * - src/lib/spriteManifest.ts には「どの動物の、どの段階の、どの動作があるか」を書く。
 *   画面は、ここにあるファイルだけを読み込む(ないファイルを読みに行かない)
 * ============================================================ */

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SPRITE_DIR = path.join(ROOT, 'public/sprites/animals')
const MANIFEST_FILE = path.join(ROOT, 'src/lib/spriteManifest.ts')

const DEFAULT_LAYOUT = { cols: 4, rows: 4 }
const DEFAULT_DURATION_MS = 120
const ALPHA_THRESHOLD = 64 // これより薄い色は「透明」とみなす(背景を消した残りのもやを無視する)

const STAGES = { baby: 'BABY', child: 'CHILD', adult: 'ADULT' }

// 予定のファイル構成(チームで決めたもの)
const PLANNED_ANIMALS = [
  ['gorilla', 'ゴリラ'],
  ['parrot', 'オウム'],
  ['monkey', 'サル'],
  ['lion', 'ライオン'],
  ['elephant', 'ゾウ'],
  ['giraffe', 'キリン'],
  ['polar-bear', 'シロクマ'],
  ['penguin', 'ペンギン'],
  ['seal', 'アザラシ'],
  ['hippo', 'カバ'],
  ['crocodile', 'ワニ'],
  ['flamingo', 'フラミンゴ'],
]
const PLANNED_ACTIONS = ['idle', 'walk']

// ===== PNG を読む(RGBA の画素を返す) =====
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 } // 色の種類 → 1画素の値の数

function readPng(file) {
  const buf = fs.readFileSync(file)
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG ではありません')

  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const idat = []
  for (let pos = 8; pos < buf.length; ) {
    const length = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    pos += 12 + length
  }

  const channels = CHANNELS[colorType]
  if (bitDepth !== 8 || !channels || interlace !== 0) {
    throw new Error(`この形式の PNG には対応していません(bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace})`)
  }

  // フィルターを戻して、1行ずつ画素を取り出す
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const out = y * stride
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? pixels[out + i - channels] : 0
      const b = y > 0 ? pixels[out - stride + i] : 0
      const c = i >= channels && y > 0 ? pixels[out - stride + i - channels] : 0
      let value = line[i]
      if (filter === 1) value += a
      else if (filter === 2) value += b
      else if (filter === 3) value += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      pixels[out + i] = value & 0xff
    }
  }

  // 画素ごとの濃さ(alpha)。alpha のない形式は、全部不透明
  const hasAlpha = colorType === 4 || colorType === 6
  const alphaAt = (x, y) => (hasAlpha ? pixels[y * stride + x * channels + channels - 1] : 255)
  return { width, height, alphaAt }
}

// ===== JSON を作る =====
function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

// 前の JSON から、コマの並び・1コマの時間・絵の向きを引き継ぐ
function settingsFrom(prev) {
  const meta = prev?.meta ?? {}
  const layout = meta.layout ?? {}
  const cols = Number(layout.cols ?? prev?.columns) || DEFAULT_LAYOUT.cols
  const rows = Number(layout.rows ?? prev?.rows) || DEFAULT_LAYOUT.rows
  const frames = prev?.frames
  const firstFrame = Array.isArray(frames) ? frames[0] : frames?.['0']
  const duration = Number(meta.frameDurationMs ?? firstFrame?.duration) || DEFAULT_DURATION_MS
  const facing = meta.facing === 'left' ? 'left' : 'right'
  return { cols, rows, duration, facing }
}

function buildSheetJson(pngFile, prev) {
  const png = readPng(pngFile)
  const { cols, rows, duration, facing } = settingsFrom(prev)
  const warnings = []

  // 割り切れないときは、1コマを切り捨てた大きさにする(となりのコマがはみ出さないように)
  const exactW = png.width / cols
  const exactH = png.height / rows
  if (!Number.isInteger(exactW) || !Number.isInteger(exactH)) {
    warnings.push(`画像 ${png.width}×${png.height} が ${cols}×${rows} で割り切れません(1コマ ${exactW}×${exactH})`)
  }
  const frameW = Math.floor(exactW)
  const frameH = Math.floor(exactH)

  const frames = {}
  const order = []
  // すべてのコマで、透明でない部分の範囲(コマの中での位置)
  let left = frameW
  let top = frameH
  let right = -1
  let bottom = -1
  for (let i = 0; i < cols * rows; i++) {
    const fx = Math.round((i % cols) * exactW)
    const fy = Math.round(Math.floor(i / cols) * exactH)
    frames[String(i)] = { x: fx, y: fy, w: frameW, h: frameH, duration }
    order.push(i)
    for (let y = 0; y < frameH; y++) {
      for (let x = 0; x < frameW; x++) {
        if (png.alphaAt(fx + x, fy + y) < ALPHA_THRESHOLD) continue
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }
  if (right < 0) {
    warnings.push('絵が見つかりません(全部透明です)')
    left = 0
    top = 0
    right = frameW - 1
    bottom = frameH - 1
  }

  const json = {
    meta: {
      image: path.basename(pngFile),
      size: { w: png.width, h: png.height },
      frameSize: { w: frameW, h: frameH },
      layout: { cols, rows },
      frameCount: cols * rows,
      frameDurationMs: duration,
      facing,
      contentBox: { x: left, y: top, w: right - left + 1, h: bottom - top + 1 },
      generator: 'scripts/sprites.mjs',
    },
    frames,
    animations: { default: order },
  }
  return { json, warnings }
}

// ===== ファイルの一覧 =====
// public/sprites/animals/<動物>/<段階>-<動作>.png を探す
function listSheets() {
  if (!fs.existsSync(SPRITE_DIR)) return []
  const sheets = []
  for (const slug of fs.readdirSync(SPRITE_DIR).sort()) {
    const dir = path.join(SPRITE_DIR, slug)
    if (!fs.statSync(dir).isDirectory()) continue
    for (const file of fs.readdirSync(dir).sort()) {
      const match = /^(baby|child|adult)-([a-z]+)\.png$/.exec(file)
      if (!match) continue
      sheets.push({ slug, stage: match[1], action: match[2], png: path.join(dir, file) })
    }
  }
  return sheets
}

// 全角文字を2文字分として、表示の幅をそろえる
function padVisual(text, width) {
  const visual = [...text].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 0xff ? 2 : 1), 0)
  return text + ' '.repeat(Math.max(1, width - visual))
}

function relative(file) {
  return path.relative(ROOT, file)
}

// ===== npm run sprites =====
function build() {
  const sheets = listSheets()
  const manifest = {}
  let warningCount = 0

  for (const sheet of sheets) {
    const jsonFile = sheet.png.replace(/\.png$/, '.json')
    const { json, warnings } = buildSheetJson(sheet.png, readJsonIfExists(jsonFile))
    fs.writeFileSync(jsonFile, `${JSON.stringify(json, null, 2)}\n`)

    const box = json.meta.contentBox
    console.log(
      `✓ ${relative(jsonFile)}  1コマ ${json.meta.frameSize.w}×${json.meta.frameSize.h}` +
        ` / 絵の範囲 ${box.w}×${box.h} / ${json.meta.frameDurationMs}ms`,
    )
    for (const warning of warnings) console.log(`  ⚠ ${warning}`)
    warningCount += warnings.length

    const stage = STAGES[sheet.stage]
    manifest[sheet.slug] ??= {}
    manifest[sheet.slug][stage] ??= []
    manifest[sheet.slug][stage].push(sheet.action)
  }

  // 段階は BABY → CHILD → ADULT、動作はアルファベット順に並べる(差分が出にくいように)
  const lines = Object.entries(manifest).map(([slug, stages]) => {
    const body = Object.values(STAGES)
      .filter((stage) => stages[stage])
      .map((stage) => `${stage}: [${stages[stage].sort().map((a) => `'${a}'`).join(', ')}]`)
      .join(', ')
    return `  '${slug}': { ${body} },`
  })
  const source = [
    '// このファイルは scripts/sprites.mjs(npm run sprites)が自動で作ります。手で書き換えないでください。',
    '// public/sprites/animals/ にある、動物ごと・成長段階ごとのスプライトの動作の一覧',
    '',
    "import type { Stage } from '@/lib/zooAreas'",
    '',
    'export const SPRITE_MANIFEST: Record<string, Partial<Record<Stage, readonly string[]>>> = {',
    ...lines,
    '}',
    '',
  ].join('\n')
  fs.writeFileSync(MANIFEST_FILE, source)

  console.log(`\n${sheets.length} 個の JSON を作り、${relative(MANIFEST_FILE)} を更新しました。`)
  if (warningCount > 0) console.log(`注意: ${warningCount} 件の警告があります(上の ⚠)。`)
}

// ===== npm run sprites:check =====
function check() {
  const sheets = listSheets()
  const have = new Set(sheets.map((s) => `${s.slug}/${s.stage}-${s.action}`))
  const plannedSlugs = new Set(PLANNED_ANIMALS.map(([slug]) => slug))
  let missing = 0
  let problems = 0

  console.log('○ = PNG と JSON がある / - = ない\n')
  console.log(`${padVisual('動物', 26)}${['baby', 'child', 'adult'].map((s) => PLANNED_ACTIONS.map((a) => `${s}-${a}`.padEnd(12)).join('')).join('')}`)
  for (const [slug, label] of PLANNED_ANIMALS) {
    const cells = []
    for (const stage of Object.keys(STAGES)) {
      for (const action of PLANNED_ACTIONS) {
        const ok = have.has(`${slug}/${stage}-${action}`)
        if (!ok) missing++
        cells.push((ok ? '○' : '-').padEnd(12))
      }
    }
    console.log(`${padVisual(`${label}(${slug})`, 26)}${cells.join('')}`)
  }

  // 予定にない動作(swim など)や、予定にないフォルダ
  const extras = sheets.filter((s) => !PLANNED_ACTIONS.includes(s.action) || !plannedSlugs.has(s.slug))
  if (extras.length > 0) {
    console.log(`\n予定の表にないファイル: ${extras.map((s) => `${s.slug}/${s.stage}-${s.action}.png`).join(', ')}`)
  }

  // JSON がない・古い、manifest が古い
  console.log('')
  const manifestSource = fs.existsSync(MANIFEST_FILE) ? fs.readFileSync(MANIFEST_FILE, 'utf8') : ''
  for (const sheet of sheets) {
    const jsonFile = sheet.png.replace(/\.png$/, '.json')
    const json = readJsonIfExists(jsonFile)
    const png = fs.readFileSync(sheet.png)
    const size = { w: png.readUInt32BE(16), h: png.readUInt32BE(20) }
    let problem = ''
    if (!json) problem = 'JSON がありません'
    else if (json.meta?.generator !== 'scripts/sprites.mjs') problem = 'JSON がスクリプトで作られていません'
    else if (json.meta.image !== path.basename(sheet.png)) problem = `JSON の image が ${json.meta.image} です`
    else if (json.meta.size.w !== size.w || json.meta.size.h !== size.h) problem = 'JSON と PNG の大きさが違います'
    else if (!new RegExp(`'${sheet.slug}': \\{[^}]*${STAGES[sheet.stage]}: \\[[^\\]]*'${sheet.action}'`).test(manifestSource)) {
      problem = 'spriteManifest.ts に入っていません'
    }
    if (problem) {
      problems++
      console.log(`⚠ ${relative(sheet.png)}: ${problem}`)
    }
  }
  if (problems > 0) console.log('→ npm run sprites を実行してください。')

  console.log(`\n足りないファイル: ${missing} 組 / 要対応: ${problems} 件`)
}

const command = process.argv[2] ?? 'build'
if (command === 'build') build()
else if (command === 'check') check()
else {
  console.error(`使い方: node scripts/sprites.mjs [build|check](指定: ${command})`)
  process.exit(1)
}
