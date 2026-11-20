/* ============================================================
 * 動物園で動物が歩ける範囲の計算
 *
 * 座標はすべて「ワールド(背景画像と同じ大きさの箱)に対する%」で扱う。
 * ワールドは画面を覆うように拡大され、スマホなどでは端が画面の外に出るので、
 * 行き先は「歩ける範囲」かつ「画面に見えている範囲」から選ぶ。
 * ============================================================ */

export interface WalkPoint {
  x: number
  y: number
}

export interface ImageSize {
  w: number
  h: number
}

// ワールドのうち、動物の足元を置いてよい範囲(画面に見えている範囲)
export interface VisibleArea {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  worldW: number // ワールドの実際の幅(px)
  worldH: number // ワールドの実際の高さ(px)
}

const PATH_CHECK_POINTS = 20 // 道筋の上を何か所調べるか
const WALK_RETRY = 10 // 行き先を選び直す回数
const STAND_RETRY = 50 // 立つ場所を選び直す回数
const NAME_LABEL_PX = 24 // 足元の下に出る名前の高さ
const REACH_CHECK_POINTS = 40 // 指定の場所へ歩くときに、道筋の上を何か所調べるか
const NUDGE_DIRECTIONS = 8 // 範囲の内側を探す方向の数
const NUDGE_DISTANCE = 0.5 // 範囲の内側に寄せる距離(%)

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

// 点が多角形の中にあるか(点から横に伸ばした線が辺と交わる回数で判定)
export function isInsidePolygon(point: WalkPoint, polygon: WalkPoint[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (crosses) inside = !inside
  }
  return inside
}

// from から to まで、まっすぐ歩いても範囲から出ないか
export function isPathInside(from: WalkPoint, to: WalkPoint, polygon: WalkPoint[]): boolean {
  for (let i = 0; i <= PATH_CHECK_POINTS; i++) {
    const t = i / PATH_CHECK_POINTS
    const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
    if (!isInsidePolygon(point, polygon)) return false
  }
  return true
}

// 画面の大きさから、動物の足元を置いてよい範囲を計算する。
// imageSize があるときは background-size: cover と同じ拡大をする(なければ画面と同じ大きさ)
export function getVisibleArea(
  viewW: number,
  viewH: number,
  imageSize: ImageSize | undefined,
  bodyW: number,
  bodyH: number,
): VisibleArea {
  const scale = imageSize ? Math.max(viewW / imageSize.w, viewH / imageSize.h) : 1
  const worldW = imageSize ? imageSize.w * scale : viewW
  const worldH = imageSize ? imageSize.h * scale : viewH

  // 画面に見えている範囲のpx(ワールドの左上が原点)
  const left = (worldW - viewW) / 2
  const top = (worldH - viewH) / 2

  // 体が画面からはみ出さないように余白を取る。画面より大きい動物は中央に寄せる
  const marginX = Math.min(bodyW / 2, viewW / 2)
  const marginTop = Math.min(bodyH, viewH / 2)
  const marginBottom = Math.min(NAME_LABEL_PX, viewH / 2)

  return {
    xMin: ((left + marginX) / worldW) * 100,
    xMax: ((left + viewW - marginX) / worldW) * 100,
    yMin: ((top + marginTop) / worldH) * 100,
    yMax: ((top + viewH - marginBottom) / worldH) * 100,
    worldW,
    worldH,
  }
}

export function isInVisibleArea(point: WalkPoint, area: VisibleArea): boolean {
  return (
    point.x >= area.xMin &&
    point.x <= area.xMax &&
    point.y >= area.yMin &&
    point.y <= area.yMax
  )
}

// 歩ける範囲の中で、画面に見えている場所を選ぶ。見つからなければ null
export function pickStandingPoint(polygon: WalkPoint[], area: VisibleArea): WalkPoint | null {
  for (let i = 0; i < STAND_RETRY; i++) {
    const point = { x: rand(area.xMin, area.xMax), y: rand(area.yMin, area.yMax) }
    if (isInsidePolygon(point, polygon)) return point
  }
  return null
}

// 今いる場所から、まっすぐ歩いて行ける行き先を選ぶ。見つからなければ null
export function pickWalkTarget(
  from: WalkPoint,
  polygon: WalkPoint[],
  area: VisibleArea,
): WalkPoint | null {
  for (let i = 0; i < WALK_RETRY; i++) {
    const to = pickStandingPoint(polygon, area)
    if (to && isPathInside(from, to, polygon)) return to
  }
  return null
}

// 点を範囲の中に収める(すでに中にあれば、そのまま返す)。辺の上の点は判定が揺れるので、少し内側に寄せる
function nearestInsidePolygon(point: WalkPoint, polygon: WalkPoint[]): WalkPoint {
  if (isInsidePolygon(point, polygon)) return point

  let nearest = polygon[0]
  let nearestDistance = Infinity
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]
    const b = polygon[i]
    const lengthSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
    const t = lengthSq
      ? Math.max(0, Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / lengthSq))
      : 0
    const candidate = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y)
    if (distance < nearestDistance) {
      nearest = candidate
      nearestDistance = distance
    }
  }

  for (let i = 0; i < NUDGE_DIRECTIONS; i++) {
    const angle = (i / NUDGE_DIRECTIONS) * Math.PI * 2
    const nudged = {
      x: nearest.x + Math.cos(angle) * NUDGE_DISTANCE,
      y: nearest.y + Math.sin(angle) * NUDGE_DISTANCE,
    }
    if (isInsidePolygon(nudged, polygon)) return nudged
  }
  return nearest
}

// タップされた場所から、実際に立てる場所を決める(歩ける範囲の中で、画面に見えている場所)
export function resolveDestination(
  tap: WalkPoint,
  polygon: WalkPoint[],
  area: VisibleArea,
): WalkPoint {
  const clamped = {
    x: Math.max(area.xMin, Math.min(area.xMax, tap.x)),
    y: Math.max(area.yMin, Math.min(area.yMax, tap.y)),
  }
  const inside = nearestInsidePolygon(clamped, polygon)
  if (isInVisibleArea(inside, area)) return inside

  // 範囲に寄せたら画面から出てしまったときは、見える場所の中でタップに近い点を選ぶ
  let best: WalkPoint = inside
  let bestDistance = Infinity
  for (let i = 0; i < STAND_RETRY; i++) {
    const point = pickStandingPoint(polygon, area)
    if (!point) break
    const distance = Math.hypot(point.x - tap.x, point.y - tap.y)
    if (distance < bestDistance) {
      best = point
      bestDistance = distance
    }
  }
  return best
}

// from から to へまっすぐ歩いて、範囲を出る手前の点を返す(出なければ to をそのまま返す)
export function lastReachablePoint(
  from: WalkPoint,
  to: WalkPoint,
  polygon: WalkPoint[],
): WalkPoint {
  let last = from
  for (let i = 1; i <= REACH_CHECK_POINTS; i++) {
    const t = i / REACH_CHECK_POINTS
    const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
    if (!isInsidePolygon(point, polygon)) return last
    last = point
  }
  return to
}

// 集まるときの立ち位置を、タップした点からのずれ(px)で返す。奥行きが出るように縦は狭くする
export function gatherOffset(index: number, count: number, radiusPx: number): WalkPoint {
  if (count <= 1) return { x: 0, y: 0 }
  const angle = (index / count) * Math.PI * 2
  return { x: Math.cos(angle) * radiusPx, y: Math.sin(angle) * radiusPx * 0.6 }
}
