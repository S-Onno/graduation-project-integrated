// 画面で使う線のアイコン(絵文字の代わり)。色は文字色(currentColor)に合わせる
export type IconName = 'list' | 'calendar' | 'matrix' | 'zoo' | 'search' | 'plus' | 'close'

const PATHS: Record<IconName, React.ReactNode> = {
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" strokeWidth="2.6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="1.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </>
  ),
  matrix: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M12 3.5v17M3.5 12h17" />
    </>
  ),
  zoo: (
    <>
      <ellipse cx="12" cy="15.5" rx="4.5" ry="3.8" />
      <circle cx="6" cy="10" r="1.7" />
      <circle cx="9.5" cy="6.5" r="1.7" />
      <circle cx="14.5" cy="6.5" r="1.7" />
      <circle cx="18" cy="10" r="1.7" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
}

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
