'use client'

/* ============================================================
 * 画面幅の区切り(ブレークポイント)と、スマホ対応の決まりごと
 *
 * - スマホ        : 600px 未満(いちばん狭い幅は 360px まで対応)
 * - タブレット・PCの半分: 600〜1023px
 * - PC            : 1024px 以上(タスク画面の区切りと同じ)
 * - スマホは縦向きだけに対応する。横向きのときは「縦にしてください」と出す(globals.css)
 * - 文字は 12px 以上、押せるものは 44px 角以上にする
 *
 * CSS の @media では、次の値をそのまま書く(styled-jsx では、この定数を使えないため)
 *   スマホ:          (max-width: 599px)
 *   PC より狭い:     (max-width: 1023px)
 *   縦長の画面:      (max-aspect-ratio: 1/1)
 * ============================================================ */

import { useSyncExternalStore } from 'react'

export const PHONE_MAX = 599
export const TABLET_MAX = 1023
export const PHONE_QUERY = `(max-width: ${PHONE_MAX}px)`

// メディアクエリに当てはまるか(サーバーで描くときは false)
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
