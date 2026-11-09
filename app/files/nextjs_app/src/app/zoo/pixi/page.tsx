import { ZooScreen } from '@/components/zoo/ZooScreen'

// 動物園画面(PixiJS で描く版)。移行が終わるまでは、HTML 版(/zoo/map)と並べて確認する
export default function ZooPixiPage() {
  return <ZooScreen renderer="pixi" />
}
