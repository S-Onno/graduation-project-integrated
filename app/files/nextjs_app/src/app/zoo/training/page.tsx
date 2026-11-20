'use client'

import { IkuseiView } from '@/components/zoo/IkuseiView'

// 育成パネルを単独で開いたとき(/zoo/training)。中身は components/zoo/IkuseiView.tsx
export default function IkuseiPage() {
  return (
    <div style={{ minHeight: '100dvh', padding: 24, background: 'var(--zoo-bg-sub, #f4ead2)' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <IkuseiView />
      </div>
    </div>
  )
}
