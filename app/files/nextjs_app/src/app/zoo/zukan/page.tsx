import { ZooScreen } from '@/components/zoo/ZooScreen'

// 動物図鑑。動物園の画面の上に、図鑑を開いた状態で表示する(中身は components/zoo/ZukanPanel.tsx)
export default function ZukanPage() {
  return <ZooScreen initialPanel="zukan" />
}
