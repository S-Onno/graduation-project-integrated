import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'

// ログイン・新規登録の共通部分(サバンナの壁紙と、木の看板)
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="za-page">
      <div className="za-box">
        <div className="za-sign">
          <div className="za-sign-title">
            <Icon name="zoo" size={26} />
            ZooTask
          </div>
          <p className="za-sign-sub">タスクをこなして、動物たちを育てよう</p>
        </div>
        {children}
      </div>
    </div>
  )
}
