'use client'

/* ============================================================
 * スプライトを React で表示するための部品(育成パネルと図鑑で使う)
 *
 * - useSpriteSheet: JSON と画像を読み込むフック(src/lib/spriteSheet.ts を使う)
 * - frameStyle: 1コマ分を、CSS の背景として表示するための指定
 * - spriteWidth: 絵の大きさをそろえるときの、箱の横幅
 * ============================================================ */

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { contentSize, loadSpriteSheet } from '@/lib/spriteSheet'
import type { SpriteFrame, SpriteSheet } from '@/lib/spriteSheet'

export type SheetState = { status: 'none' } | { status: 'loading' } | { status: 'ready'; sheet: SpriteSheet } | { status: 'error' }

// スプライトを読み込むフック。ファイルがないときは 'error' になり、絵文字で表示する
export function useSpriteSheet(jsonUrl: string | undefined): SheetState {
  const [loaded, setLoaded] = useState<{ url: string; sheet: SpriteSheet | null } | null>(null)

  useEffect(() => {
    if (!jsonUrl) return
    let ignore = false
    loadSpriteSheet(jsonUrl)
      .then((sheet) => {
        if (!ignore) setLoaded({ url: jsonUrl, sheet })
      })
      .catch(() => {
        if (!ignore) setLoaded({ url: jsonUrl, sheet: null })
      })
    return () => {
      ignore = true
    }
  }, [jsonUrl])

  if (!jsonUrl) return { status: 'none' }
  if (!loaded || loaded.url !== jsonUrl) return { status: 'loading' }
  return loaded.sheet ? { status: 'ready', sheet: loaded.sheet } : { status: 'error' }
}

// 1コマ分を表示するための背景の指定。
// コマのうち「透明でない部分」だけを切り出すので、足元が箱の下端になる。
// 箱の大きさは%で指定する(箱の横幅は、width で渡す)
export function frameStyle(sheet: SpriteSheet, frame: SpriteFrame, width?: string): CSSProperties {
  const { content } = sheet
  const srcX = frame.x + content.x
  const srcY = frame.y + content.y
  const posX = sheet.sheetW > content.w ? (srcX / (sheet.sheetW - content.w)) * 100 : 0
  const posY = sheet.sheetH > content.h ? (srcY / (sheet.sheetH - content.h)) * 100 : 0
  return {
    width,
    backgroundImage: `url(${sheet.image})`,
    backgroundSize: `${(sheet.sheetW / content.w) * 100}% ${(sheet.sheetH / content.h) * 100}%`,
    backgroundPosition: `${posX}% ${posY}%`,
    aspectRatio: `${content.w} / ${content.h}`,
  }
}

// 絵の大きさが size(単位は unit。標準は cqw)になるときの、箱の横幅
export function spriteWidth(sheet: SpriteSheet, size: number, unit = 'cqw'): string {
  return `${(sheet.content.w / contentSize(sheet)) * size}${unit}`
}

// 絵の長い辺が size(cqw)になるときの、箱の横幅(図鑑のカードのように、決まった枠に収めるとき)
export function fitWidth(sheet: SpriteSheet, size: number): string {
  const { w, h } = sheet.content
  return `${(w / Math.max(w, h)) * size}cqw`
}
