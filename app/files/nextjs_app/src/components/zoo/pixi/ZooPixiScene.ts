/* ============================================================
 * 動物園の PixiJS 版
 *
 * - 動物と演出を <canvas> に GPU(WebGL)で描く。壁紙は HTML(CSS)のまま、
 *   その上に透明な <canvas> を重ねる
 * - 歩ける範囲や行き先の計算は、HTML 版と同じ zooWalk.ts を使う
 * - 操作(HTML 版と同じ)
 *     動物をタップ: 選ぶ(ハートを出して跳ね、足元に輪が出て止まる)
 *     選択中に地面をタップ: そこへ歩き、着いたら選択を解除
 *     何も選ばずに地面をタップ: 全員が集まり、最後の1匹が着いて約5秒後に歩き出す
 * - 演出: タップのキラキラと目印、木漏れ日、成長したときの光の柱
 * - 選択や移動の状態はこのクラスの中だけで持ち、React の再描画を起こさない
 *   (タップへの反応を速く保つため)。React からは init()、destroy()、playGrowth() を呼ぶ
 * ============================================================ */

import {
  AnimatedSprite,
  Application,
  Assets,
  Container,
  Graphics,
  Particle,
  ParticleContainer,
  Rectangle,
  Sprite,
  Text,
  Texture,
} from 'pixi.js'
import type { FederatedPointerEvent, FrameObject } from 'pixi.js'
import {
  gatherOffset,
  getVisibleArea,
  isInVisibleArea,
  lastReachablePoint,
  pickStandingPoint,
  pickWalkTarget,
  resolveDestination,
} from '@/lib/zooWalk'
import type { VisibleArea, WalkPoint } from '@/lib/zooWalk'
import {
  COMMAND_PAUSE_MS,
  COMMAND_SPEED_PX,
  DEFAULT_WALK_AREA,
  EMOJI_BOX,
  FOOT_PADDING,
  GATHER_RADIUS_PX,
  SPRITE_ZOOM,
  WALK_SPEED_PX,
} from '@/lib/zooAreas'
import type { AnimalDef, AreaDef } from '@/lib/zooAreas'

// ===== 設定 =====
const MAX_RESOLUTION = 2 // 高精細な画面でも描く量が増えすぎないように、倍率の上限を決める
const STATS_INTERVAL_MS = 500 // fps と粒子の数を知らせる間隔
const LABEL_FONT_SIZE = 12 // 名前の札の文字の大きさ

// キラキラ(タップ)
const SPARKLE_LIFE_MS = 700
const SPARKLE_COLORS = [0xfff27a, 0xffffff, 0xffd1f0, 0xa8f0ff]
// 光の玉の色。<canvas> は透明で壁紙は HTML 側にあるため、加算合成で壁紙を明るくすることはできない。
// 暗い色にすると、そのまま暗いしみに見えるので、明るい色にして濃さ(alpha)で強さを調整する
const GLOW_COLOR = 0xfff3c8
const GROUND_SPARKLES = 10 // 地面をタップしたときの星の数
const ANIMAL_SPARKLES = 8 // 動物をタップしたときの星の数

// タップの反応・目印・選択の輪
const HOP_MS = 450 // 跳ねる時間
const HOP_HEIGHT = 22 // 跳ねる高さ(px)
const HEART_MS = 900
const MARKER_MS = 700
const RING_PULSE_MS = 900 // 選択中の輪が明るさを変える周期

// 木漏れ日
const SUNBEAM_COUNT = 3 // 斜めに差し込む光の筋の数
const SUNSPOT_COUNT = 7 // 地面に落ちる光の玉の数

// 成長したときの光の柱
const GROWTH_MS = 1800
const GROWTH_SPARKLES = 26

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

// ===== スプライトシート(JSON)の型 =====
interface SpriteSheetJson {
  meta: { image: string }
  frames: Record<string, { x: number; y: number; w: number; h: number; duration: number }>
  animations: Record<string, number[]>
}

// JSON と画像から、PixiJS のアニメーション用のコマを作る
async function loadAnimalFrames(jsonUrl: string): Promise<FrameObject[]> {
  const res = await fetch(jsonUrl)
  if (!res.ok) throw new Error(`スプライトを読み込めません: ${jsonUrl}`)
  const json = (await res.json()) as SpriteSheetJson
  const imageUrl = new URL(json.meta.image, new URL(jsonUrl, window.location.href)).pathname
  const sheet = await Assets.load<Texture>(imageUrl)
  sheet.source.scaleMode = 'nearest' // ドット絵をにじませない

  const order = json.animations.default ?? Object.keys(json.frames).map(Number)
  return order.map((index) => {
    const f = json.frames[String(index)]
    return {
      texture: new Texture({ source: sheet.source, frame: new Rectangle(f.x, f.y, f.w, f.h) }),
      time: f.duration,
    }
  })
}

// ===== 粒子(星と光の玉) =====
interface ParticleState {
  particle: Particle
  vx: number // 1秒あたりのpx
  vy: number
  gravity: number // 1秒あたりに vy に足す量
  age: number
  life: number
  startScale: number
  endScale: number
  spin: number // 1秒あたりの回転(ラジアン)
  maxAlpha: number // 出たときの濃さ(だんだん薄くなって消える)
}

type ParticleOptions = Omit<ParticleState, 'particle' | 'age' | 'maxAlpha'> & {
  tint: number
  maxAlpha?: number // 省略すると 1
}

// ===== 時間で動いて消える演出(目印、ハート、光の柱) =====
interface Effect {
  sprite: Sprite
  startedAt: number
  duration: number
  update: (sprite: Sprite, t: number) => void // t は 0 → 1
}

// ===== 歩き回る動物 =====
interface Walker {
  name: string
  root: Container
  body: AnimatedSprite | Text
  ring: Graphics
  boxW: number
  boxH: number
  footPad: number
  pos: WalkPoint // いまいる場所(壁紙に対する%)
  from: WalkPoint
  to: WalkPoint
  startedAt: number
  duration: number
  moving: boolean
  restUntil: number // この時刻まで休む
  held: boolean // 選ばれて、その場で待っている
  commanded: boolean // タップで指示された場所へ歩いている
  resumeAt: number // 指示された場所に着いたあと、また歩き出す時刻
  onArrive: (() => void) | null
  hopStartedAt: number // 跳ね始めた時刻(跳ねていなければ -Infinity)
  visible: VisibleArea
}

export interface ZooPixiStats {
  fps: number
  particles: number
}

export class ZooPixiScene {
  private readonly app = new Application()
  private readonly walkArea: WalkPoint[]
  private readonly walkers: Walker[] = []
  private readonly sparkles: ParticleState[] = []
  private readonly glows: ParticleState[] = []
  private readonly effects: Effect[] = []
  private readonly ownTextures: Texture[] = [] // このクラスで作ったテクスチャ(最後に破棄する)
  private readonly lightLayer = new Container() // 木漏れ日
  private readonly markerLayer = new Container() // タップの目印(動物の後ろ)
  private readonly animalLayer = new Container({ sortableChildren: true })
  private readonly effectLayer = new Container() // ハート、光の柱(動物の前)
  private sparkleLayer!: ParticleContainer
  private glowLayer!: ParticleContainer
  private textures!: Record<'star' | 'glow' | 'heart' | 'marker' | 'beam', Texture>
  private sunbeams: { sprite: Sprite; baseX: number; phase: number }[] = []
  private sunspots: { sprite: Sprite; pos: WalkPoint; phase: number }[] = []
  private selected: Walker | null = null
  private resizeObserver: ResizeObserver | null = null
  private world = { x: 0, y: 0, w: 0, h: 0 } // 壁紙が画面いっぱいに広がったときの位置と大きさ(px)
  private statsElapsed = 0
  private ready = false
  private destroyed = false

  constructor(
    private readonly host: HTMLElement,
    private readonly def: AreaDef,
    private readonly animals: AnimalDef[],
    private readonly onStats?: (stats: ZooPixiStats) => void,
  ) {
    this.walkArea = def.walkArea ?? DEFAULT_WALK_AREA
  }

  async init(): Promise<void> {
    await this.app.init({
      width: Math.max(1, this.host.clientWidth),
      height: Math.max(1, this.host.clientHeight),
      resolution: Math.min(window.devicePixelRatio || 1, MAX_RESOLUTION),
      autoDensity: true,
      antialias: false,
      backgroundAlpha: 0, // 透明にして、下の壁紙(HTML)を見せる
      preference: 'webgl',
    })
    // 起動中に画面を離れた(React が片付けた)ときは、ここで終わる
    if (this.destroyed) {
      this.app.destroy({ removeView: true }, { children: true })
      return
    }
    this.ready = true
    this.host.appendChild(this.app.canvas)

    this.createTextures()
    this.app.stage.addChild(
      this.markerLayer,
      this.animalLayer,
      this.lightLayer,
      this.effectLayer,
      this.glowLayer,
      this.sparkleLayer,
    )
    // 飾り(光、目印、ハート、粒子)はタップを受け取らない。受け取ると、動物の手前にある光の筋が
    // タップを横取りして、動物を押しても地面のタップになってしまう
    for (const layer of [this.markerLayer, this.lightLayer, this.effectLayer, this.glowLayer, this.sparkleLayer]) {
      layer.eventMode = 'none'
    }
    this.layout()
    if (this.def.sunbeams) this.createSunlight()
    await this.createWalkers()
    if (this.destroyed) return

    // 地面のタップ。動物のタップは動物ごとに受け取り、ここまで届かないようにする
    this.app.stage.eventMode = 'static'
    this.app.stage.hitArea = this.app.screen
    this.app.stage.on('pointerdown', this.handleGroundTap)

    this.resizeObserver = new ResizeObserver(() => this.layout())
    this.resizeObserver.observe(this.host)
    this.app.ticker.add(this.update)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.resizeObserver?.disconnect()
    if (!this.ready) return // 起動が終わったときに init() の中で片付ける
    this.app.ticker.remove(this.update)
    this.app.destroy({ removeView: true }, { children: true })
    this.ownTextures.forEach((texture) => texture.destroy(true))
  }

  // 成長したときの光の柱を出す(名前を指定しなければ、最初の動物)
  playGrowth(name?: string): void {
    if (!this.ready || this.destroyed) return
    const walker = this.walkers.find((w) => w.name === name) ?? this.walkers[0]
    if (!walker) return
    const now = performance.now()
    // 光の柱が動物から離れないように、自由に歩いている動物はその場で止める
    if (!walker.commanded) {
      this.stopWalking(walker, now)
      this.placeWalkers(now)
      walker.restUntil = Math.max(walker.restUntil, now + GROWTH_MS + 500)
    }
    const x = walker.root.x
    const y = walker.root.y
    walker.hopStartedAt = now

    // 光の柱: 上から足元まで伸び、太くなってから細くなって消える
    const beam = new Sprite(this.textures.beam)
    beam.anchor.set(0.5, 1)
    beam.blendMode = 'add'
    beam.tint = 0xfff3b0
    beam.position.set(x, y + walker.footPad)
    const beamHeight = Math.max(y + walker.footPad, walker.boxH * 2)
    this.addEffect(beam, GROWTH_MS, (sprite, t) => {
      const grow = Math.sin(Math.PI * t) // 0 → 1 → 0
      sprite.width = walker.boxW * (0.4 + 0.8 * grow)
      sprite.height = beamHeight * Math.min(1, t * 4)
      sprite.alpha = 0.9 * grow
    })
    // 足元の光と、立ちのぼる星
    this.addParticle(this.glows, this.glowLayer, x, y, {
      vx: 0,
      vy: 0,
      gravity: 0,
      life: GROWTH_MS,
      startScale: walker.boxW / 30,
      endScale: walker.boxW / 60,
      spin: 0,
      maxAlpha: 0.45,
      tint: GLOW_COLOR,
    })
    for (let i = 0; i < GROWTH_SPARKLES; i++) {
      this.addParticle(this.sparkles, this.sparkleLayer, x + rand(-0.4, 0.4) * walker.boxW, y, {
        vx: rand(-20, 20),
        vy: rand(-260, -90),
        gravity: 0,
        life: rand(0.6, 1) * GROWTH_MS,
        startScale: rand(0.5, 1),
        endScale: 0.1,
        spin: rand(-4, 4),
        tint: SPARKLE_COLORS[i % SPARKLE_COLORS.length],
      })
    }
  }

  // テスト用: 動物の状態を返す(URL に ?pixiDebug を付けたときだけ、画面から読めるようにする)
  getDebugState() {
    return {
      selected: this.selected?.name ?? null,
      effects: this.effects.length,
      particles: this.sparkles.length + this.glows.length,
      walkers: this.walkers.map((w) => ({
        name: w.name,
        x: w.root.x,
        y: w.root.y,
        pos: w.pos,
        boxW: w.boxW,
        boxH: w.boxH,
        footPad: w.footPad,
        moving: w.moving,
        held: w.held,
        commanded: w.commanded,
        ring: w.ring.visible,
        restIn: Math.round(w.restUntil - performance.now()),
        resumeIn: Math.round(w.resumeAt - performance.now()),
      })),
    }
  }

  // ----- 準備 -----

  private createTextures() {
    const renderer = this.app.renderer
    const star = new Graphics().star(0, 0, 4, 10, 3).fill(0xffffff)
    const glow = new Graphics()
    for (let i = 6; i >= 1; i--) glow.circle(0, 0, i * 3).fill({ color: 0xffffff, alpha: 0.12 })
    const marker = new Graphics().ellipse(0, 0, 28, 14).stroke({ color: 0xffffff, width: 3 })
    const heart = new Text({ text: '💗', style: { fontSize: 24 } })

    // 光の筋: 横は中央ほど明るく、縦は下ほど薄い(小さな四角を重ねて作る)
    const beam = new Graphics()
    const columns = 12
    const rows = 24
    for (let c = 0; c < columns; c++) {
      const across = Math.exp(-(((c + 0.5) / columns - 0.5) ** 2) / 0.045)
      for (let r = 0; r < rows; r++) {
        const down = 1 - r / rows
        beam.rect(c * 4, r * 8, 4, 8).fill({ color: 0xffffff, alpha: across * (0.25 + 0.75 * down) })
      }
    }

    this.textures = {
      star: renderer.generateTexture(star),
      glow: renderer.generateTexture(glow),
      marker: renderer.generateTexture(marker),
      heart: renderer.generateTexture(heart),
      beam: renderer.generateTexture(beam),
    }
    this.ownTextures.push(...Object.values(this.textures))
    ;[star, glow, marker, heart, beam].forEach((g) => g.destroy())

    const dynamicProperties = { position: true, vertex: true, rotation: true, color: true }
    this.sparkleLayer = new ParticleContainer({ dynamicProperties, texture: this.textures.star })
    this.glowLayer = new ParticleContainer({ dynamicProperties, texture: this.textures.glow })
    this.sparkleLayer.blendMode = 'add' // 光らせる(重ねるほど明るくなる)
    this.glowLayer.blendMode = 'add'
  }

  // 木漏れ日: 斜めに差し込む光の筋と、地面でゆらぐ光の玉
  private createSunlight() {
    for (let i = 0; i < SUNBEAM_COUNT; i++) {
      const sprite = new Sprite(this.textures.beam)
      sprite.anchor.set(0.5, 0)
      sprite.blendMode = 'add'
      sprite.tint = 0xfff0c0
      sprite.rotation = -0.35
      this.lightLayer.addChild(sprite)
      this.sunbeams.push({ sprite, baseX: (i + 0.7) / (SUNBEAM_COUNT + 0.4), phase: rand(0, Math.PI * 2) })
    }
    for (let i = 0; i < SUNSPOT_COUNT; i++) {
      const sprite = new Sprite(this.textures.glow)
      sprite.anchor.set(0.5)
      sprite.blendMode = 'add'
      sprite.tint = GLOW_COLOR
      const pos = pickStandingPoint(this.walkArea, this.visibleAreaFor(0, 0)) ?? this.walkArea[0]
      this.lightLayer.addChild(sprite)
      this.sunspots.push({ sprite, pos, phase: rand(0, Math.PI * 2) })
    }
    this.placeSunlight(performance.now())
  }

  private async createWalkers() {
    const now = performance.now()
    for (const animal of this.animals) {
      const zoom = animal.zoom ?? SPRITE_ZOOM
      let body: AnimatedSprite | Text
      let boxW: number
      let boxH: number
      let footPad: number

      const frames = animal.spriteJson
        ? await loadAnimalFrames(animal.spriteJson).catch(() => null)
        : null
      if (this.destroyed) return

      if (frames && frames.length > 0) {
        const sprite = new AnimatedSprite(frames)
        sprite.anchor.set(0.5, 1)
        sprite.scale.set(zoom)
        sprite.gotoAndStop(0)
        body = sprite
        boxW = frames[0].texture.frame.width * zoom
        boxH = frames[0].texture.frame.height * zoom
        footPad = (animal.footPadding ?? FOOT_PADDING) * zoom
      } else {
        // スプライトがない(読み込めない)動物は、絵文字で表示する
        const text = new Text({
          text: animal.emoji,
          style: { fontSize: EMOJI_BOX * SPRITE_ZOOM * 0.8, fontFamily: 'sans-serif' },
        })
        text.anchor.set(0.5, 1)
        body = text
        boxW = EMOJI_BOX * SPRITE_ZOOM
        boxH = EMOJI_BOX * SPRITE_ZOOM
        footPad = 0
      }
      body.y = footPad // 画像の下の余白ぶん下げて、足元を地面に合わせる

      const shadow = new Graphics()
        .ellipse(0, 0, boxW * 0.3, boxH * 0.06)
        .fill({ color: 0x000000, alpha: 0.25 })
      const ring = new Graphics()
        .ellipse(0, 0, boxW * 0.45, boxH * 0.13)
        .stroke({ color: 0xff5a5a, width: 8, alpha: 0.35 })
        .ellipse(0, 0, boxW * 0.45, boxH * 0.13)
        .stroke({ color: 0xffffff, width: 4 })
      ring.visible = false
      const label = this.createLabel(animal.name)
      label.y = footPad + 4

      const root = new Container()
      root.addChild(shadow, ring, body, label)
      // タップを受け取る範囲は、画像の透明な余白を除いた体のあたりにする
      root.eventMode = 'static'
      root.cursor = 'pointer'
      root.hitArea = new Rectangle(-boxW * 0.35, footPad - boxH * 0.9, boxW * 0.7, boxH * 0.9)
      this.animalLayer.addChild(root)

      const visible = this.visibleAreaFor(boxW, boxH)
      const start = pickStandingPoint(this.walkArea, visible) ?? this.walkArea[0]
      const walker: Walker = {
        name: animal.name,
        root,
        body,
        ring,
        boxW,
        boxH,
        footPad,
        pos: start,
        from: start,
        to: start,
        startedAt: now,
        duration: 0,
        moving: false,
        restUntil: now + rand(300, 2500),
        held: false,
        commanded: false,
        resumeAt: 0,
        onArrive: null,
        hopStartedAt: -Infinity,
        visible,
      }
      root.on('pointerdown', (e: FederatedPointerEvent) => {
        e.stopPropagation() // 地面のタップとして扱わない
        this.handleAnimalTap(walker, e)
      })
      this.walkers.push(walker)
    }
    this.placeWalkers(now)
  }

  // 名前の札(HTML 版と同じ、暗い背景に明るい文字)
  private createLabel(name: string): Container {
    const text = new Text({
      text: name,
      style: {
        fontSize: LABEL_FONT_SIZE,
        fill: 0xf4e6b8,
        fontFamily: "'DotGothic16', 'MS Gothic', 'Osaka-Mono', monospace",
      },
      resolution: Math.min(window.devicePixelRatio || 1, MAX_RESOLUTION),
    })
    text.anchor.set(0.5, 0)
    const plate = new Graphics()
      .rect(-text.width / 2 - 6, 0, text.width + 12, text.height)
      .fill({ color: 0x0b0d17, alpha: 0.75 })
    const label = new Container()
    label.addChild(plate, text)
    return label
  }

  // ----- 画面サイズ -----

  private visibleAreaFor(boxW: number, boxH: number): VisibleArea {
    return getVisibleArea(
      this.app.screen.width,
      this.app.screen.height,
      this.def.wallpaperSize,
      boxW,
      boxH,
    )
  }

  private toScreen(point: WalkPoint): { x: number; y: number } {
    return {
      x: this.world.x + (point.x / 100) * this.world.w,
      y: this.world.y + (point.y / 100) * this.world.h,
    }
  }

  // 壁紙が画面いっぱいに広がったときの位置と大きさを計算する(background-size: cover と同じ計算)
  private layout = () => {
    if (this.destroyed || !this.ready) return
    const viewW = Math.max(1, this.host.clientWidth)
    const viewH = Math.max(1, this.host.clientHeight)
    this.app.renderer.resize(viewW, viewH)

    const size = this.def.wallpaperSize
    const scale = size ? Math.max(viewW / size.w, viewH / size.h) : 1
    const w = size ? size.w * scale : viewW
    const h = size ? size.h * scale : viewH
    this.world = { x: (viewW - w) / 2, y: (viewH - h) / 2, w, h }

    // 行き先が見えなくなった動物は、すぐに見える場所へ歩き直す
    const now = performance.now()
    for (const walker of this.walkers) {
      walker.visible = this.visibleAreaFor(walker.boxW, walker.boxH)
      const goal = walker.moving ? walker.to : walker.pos
      if (isInVisibleArea(goal, walker.visible)) continue
      if (walker.held) {
        walker.pos = pickStandingPoint(this.walkArea, walker.visible) ?? walker.pos
        continue
      }
      this.stopWalking(walker, now)
      this.finishCommand(walker)
      walker.restUntil = now
    }
    this.placeWalkers(now)
    this.placeSunlight(now)
  }

  // ----- 毎フレームの処理 -----

  private update = () => {
    const now = performance.now()
    const dt = this.app.ticker.deltaMS / 1000
    for (const walker of this.walkers) this.updateWalker(walker, now)
    this.placeWalkers(now)
    this.placeSunlight(now)
    this.updateEffects(now)
    this.updateParticles(this.sparkles, this.sparkleLayer, dt)
    this.updateParticles(this.glows, this.glowLayer, dt)

    this.statsElapsed += this.app.ticker.deltaMS
    if (this.onStats && this.statsElapsed >= STATS_INTERVAL_MS) {
      this.statsElapsed = 0
      this.onStats({
        fps: Math.round(this.app.ticker.FPS),
        particles: this.sparkles.length + this.glows.length + this.effects.length,
      })
    }
  }

  private updateWalker(walker: Walker, now: number) {
    if (walker.moving) {
      const t = Math.min(1, (now - walker.startedAt) / walker.duration)
      walker.pos = this.lerp(walker.from, walker.to, t)
      if (t < 1) return
      this.stopWalking(walker, now)
      if (walker.commanded) {
        // 指示された場所に着いたら、決められた時刻まで待ってから歩き出す
        this.finishCommand(walker)
        walker.restUntil = Math.max(walker.resumeAt, now) + rand(0, 1000)
      } else {
        walker.restUntil = now + rand(1000, 4000)
      }
      return
    }
    if (walker.held || now < walker.restUntil) return

    const to = pickWalkTarget(walker.pos, this.walkArea, walker.visible)
    if (!to) {
      // 行ける場所がなければ休む。画面の外にいるときだけ、見える場所へ移す
      if (!isInVisibleArea(walker.pos, walker.visible)) {
        walker.pos = pickStandingPoint(this.walkArea, walker.visible) ?? walker.pos
      }
      walker.restUntil = now + rand(1000, 4000)
      return
    }
    this.startTrip(walker, to, WALK_SPEED_PX, now)
  }

  private lerp(from: WalkPoint, to: WalkPoint, t: number): WalkPoint {
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
  }

  // to へ歩き出す。着くまでの時間(ms)を返す
  private startTrip(walker: Walker, to: WalkPoint, speed: number, now: number): number {
    if (walker.moving) this.stopWalking(walker, now) // 歩いている途中なら、いまいる場所から
    const dxPx = ((to.x - walker.pos.x) / 100) * this.world.w
    const dyPx = ((to.y - walker.pos.y) / 100) * this.world.h
    walker.from = walker.pos
    walker.to = to
    walker.startedAt = now
    walker.duration = Math.max(800, (Math.hypot(dxPx, dyPx) / speed) * 1000)
    walker.moving = true
    // 左に歩くときは、左右を反転(画像は右向き)
    if (Math.abs(dxPx) > 4) walker.body.scale.x = Math.abs(walker.body.scale.x) * (dxPx < 0 ? -1 : 1)
    if (walker.body instanceof AnimatedSprite) walker.body.play()
    return walker.duration
  }

  private stopWalking(walker: Walker, now: number) {
    if (walker.moving) {
      const t = Math.min(1, (now - walker.startedAt) / walker.duration)
      walker.pos = this.lerp(walker.from, walker.to, t)
    }
    walker.moving = false
    if (walker.body instanceof AnimatedSprite) walker.body.gotoAndStop(0)
  }

  // 指示された移動を終える(着いたときの処理を呼ぶ)
  private finishCommand(walker: Walker) {
    walker.commanded = false
    const onArrive = walker.onArrive
    walker.onArrive = null
    onArrive?.()
  }

  // 壁紙に対する%を画面のpxに直して置く。画面の下にいる動物ほど手前に表示
  private placeWalkers(now: number) {
    const pulse = 0.65 + 0.35 * Math.sin((now / RING_PULSE_MS) * Math.PI * 2)
    for (const walker of this.walkers) {
      const { x, y } = this.toScreen(walker.pos)
      walker.root.position.set(x, y)
      walker.root.zIndex = y
      const hop = (now - walker.hopStartedAt) / HOP_MS
      walker.body.y = walker.footPad - (hop >= 0 && hop < 1 ? Math.sin(Math.PI * hop) * HOP_HEIGHT : 0)
      if (walker.ring.visible) walker.ring.alpha = pulse
    }
  }

  // 木漏れ日をゆっくりゆらす
  private placeSunlight(now: number) {
    const viewH = this.app.screen.height
    for (const beam of this.sunbeams) {
      const sway = Math.sin(now / 4000 + beam.phase)
      beam.sprite.position.set(this.world.x + beam.baseX * this.world.w + sway * 20, -viewH * 0.05)
      beam.sprite.width = Math.max(90, this.world.w * 0.09)
      beam.sprite.height = viewH * 1.15
      beam.sprite.alpha = 0.1 + 0.06 * Math.sin(now / 2600 + beam.phase)
    }
    for (const spot of this.sunspots) {
      const { x, y } = this.toScreen(spot.pos)
      spot.sprite.position.set(x, y)
      spot.sprite.scale.set((this.world.w / 1376) * (2.2 + 0.4 * Math.sin(now / 1800 + spot.phase)), (this.world.w / 1376) * 1.1)
      spot.sprite.alpha = 0.16 + 0.1 * Math.sin(now / 2200 + spot.phase)
    }
  }

  // ----- 操作 -----

  // 動物をタップ: 選ぶ。選択中の動物をもう一度タップすると解除、別の動物なら切り替え
  private handleAnimalTap(walker: Walker, e: FederatedPointerEvent) {
    const now = performance.now()
    this.react(walker, now)
    this.spawnSparkles(e.global.x, e.global.y, ANIMAL_SPARKLES, 140)

    const previous = this.selected
    if (previous) this.release(previous, now)
    if (previous === walker) {
      this.select(null)
      return
    }
    this.stopWalking(walker, now)
    walker.commanded = false
    walker.onArrive = null
    walker.held = true
    this.select(walker)
  }

  // 地面をタップ: 選択中の動物がそこへ歩く。誰も選ばれていなければ、全員が集まる
  private handleGroundTap = (e: FederatedPointerEvent) => {
    const now = performance.now()
    const { x, y } = e.global
    this.showMarker(x, y)
    this.spawnSparkles(x, y, GROUND_SPARKLES, 120)
    const tap = {
      x: ((x - this.world.x) / this.world.w) * 100,
      y: ((y - this.world.y) / this.world.h) * 100,
    }

    const target = this.selected
    if (target) {
      this.goTo(target, tap, { x: 0, y: 0 }, now, () => {
        if (this.selected === target) this.select(null)
      })
      return
    }
    const radius = Math.min(GATHER_RADIUS_PX, this.app.screen.width / 4)
    const durations = this.walkers.map((walker, i) =>
      this.goTo(walker, tap, gatherOffset(i, this.walkers.length, radius), now, null),
    )
    // 最後の1匹が着いてから、みんなで歩き出す
    const resumeAt = now + Math.max(...durations) + COMMAND_PAUSE_MS
    this.walkers.forEach((walker) => (walker.resumeAt = resumeAt))
  }

  // 指定の場所へ歩く。着くまでの時間(ms)を返す
  private goTo(
    walker: Walker,
    tap: WalkPoint,
    offsetPx: WalkPoint,
    now: number,
    onArrive: (() => void) | null,
  ): number {
    walker.held = false
    if (walker.moving) this.stopWalking(walker, now)
    const wanted = {
      x: tap.x + (offsetPx.x / this.world.w) * 100,
      y: tap.y + (offsetPx.y / this.world.h) * 100,
    }
    const destination = resolveDestination(wanted, this.walkArea, walker.visible)
    const to = lastReachablePoint(walker.pos, destination, this.walkArea)
    const duration = this.startTrip(walker, to, COMMAND_SPEED_PX, now)
    walker.commanded = true
    walker.onArrive = onArrive
    walker.resumeAt = now + duration + COMMAND_PAUSE_MS
    return duration
  }

  private select(walker: Walker | null) {
    if (this.selected) this.selected.ring.visible = false
    this.selected = walker
    if (walker) walker.ring.visible = true
  }

  // 待つのをやめて、自由に歩き出す
  private release(walker: Walker, now: number) {
    if (!walker.held) return
    walker.held = false
    walker.restUntil = now + rand(1000, 4000)
  }

  // ----- 演出 -----

  // タップされた動物が跳ねて、ハートを出す
  private react(walker: Walker, now: number) {
    walker.hopStartedAt = now
    const heart = new Sprite(this.textures.heart)
    heart.anchor.set(0.5)
    const startY = walker.root.y + walker.footPad - walker.boxH * 0.9
    heart.position.set(walker.root.x, startY)
    this.addEffect(heart, HEART_MS, (sprite, t) => {
      sprite.y = startY - 48 * t
      sprite.scale.set(0.7 + 0.5 * t)
      sprite.alpha = 1 - t
    })
  }

  // タップした場所の目印(広がって消える輪)
  private showMarker(x: number, y: number) {
    const marker = new Sprite(this.textures.marker)
    marker.anchor.set(0.5)
    marker.position.set(x, y)
    this.addEffect(marker, MARKER_MS, (sprite, t) => {
      sprite.scale.set(0.3 + t)
      sprite.alpha = 0.9 * (1 - t)
    }, this.markerLayer)
  }

  private spawnSparkles(x: number, y: number, count: number, speed: number) {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2)
      const v = rand(0.35, 1) * speed
      this.addParticle(this.sparkles, this.sparkleLayer, x, y, {
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v - 50,
        gravity: 220,
        life: rand(0.7, 1) * SPARKLE_LIFE_MS,
        startScale: rand(0.5, 0.9),
        endScale: 0.1,
        spin: rand(-6, 6),
        tint: SPARKLE_COLORS[i % SPARKLE_COLORS.length],
      })
    }
    this.addParticle(this.glows, this.glowLayer, x, y, {
      vx: 0,
      vy: -30,
      gravity: 0,
      life: SPARKLE_LIFE_MS,
      startScale: 1.1,
      endScale: 0.4,
      spin: 0,
      maxAlpha: 0.4, // 薄くして、続けてタップしても白くなりすぎないようにする
      tint: GLOW_COLOR,
    })
  }

  private addEffect(
    sprite: Sprite,
    duration: number,
    update: Effect['update'],
    layer: Container = this.effectLayer,
  ) {
    layer.addChild(sprite)
    update(sprite, 0)
    this.effects.push({ sprite, startedAt: performance.now(), duration, update })
  }

  private updateEffects(now: number) {
    if (this.effects.length === 0) return
    let alive = 0
    for (const effect of this.effects) {
      const t = (now - effect.startedAt) / effect.duration
      if (t >= 1) {
        effect.sprite.destroy()
        continue
      }
      effect.update(effect.sprite, t)
      this.effects[alive++] = effect
    }
    this.effects.length = alive
  }

  private addParticle(
    list: ParticleState[],
    layer: ParticleContainer,
    x: number,
    y: number,
    options: ParticleOptions,
  ) {
    const { tint, maxAlpha = 1, ...rest } = options
    const state = { ...rest, maxAlpha }
    const particle = new Particle({
      texture: layer.texture,
      x,
      y,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: state.startScale,
      scaleY: state.startScale,
      tint,
      alpha: maxAlpha,
    })
    layer.addParticle(particle)
    list.push({ ...state, particle, age: 0 })
  }

  private updateParticles(list: ParticleState[], layer: ParticleContainer, dt: number) {
    if (list.length === 0) return
    let alive = 0
    for (const state of list) {
      state.age += dt * 1000
      if (state.age >= state.life) continue
      const t = state.age / state.life
      const p = state.particle
      state.vy += state.gravity * dt
      p.x += state.vx * dt
      p.y += state.vy * dt
      p.rotation += state.spin * dt
      const scale = state.startScale + (state.endScale - state.startScale) * t
      p.scaleX = scale
      p.scaleY = scale
      p.alpha = state.maxAlpha * (1 - t * t) // 終わりに近づくほど早く消える
      list[alive++] = state
    }
    if (alive === list.length) return
    list.length = alive
    layer.particleChildren.length = 0
    for (const state of list) layer.particleChildren.push(state.particle)
    layer.update()
  }
}
