// App frame for the 3 window shapes (SPEC §4), mapped onto the design system:
// - portrait: full width (max 480), side margin 16
// - square:   max 768, side margin 56 (24 on small windows)
// - landscape: mist page, centered app card max 1056; row 1 spans the card,
//   content sits in columns 3–10 (624 wide)
// Screens scroll vertically instead of being forced into 10 fixed rows.

import type { ReactNode } from 'react'
import { Smartphone } from 'lucide-react'
import clsx from 'clsx'
import { useFrame, type FrameMode } from '@/hooks/useFrame'

export function Frame({ nav, children }: { nav?: ReactNode; children: ReactNode }) {
  const { mode, rotate } = useFrame()

  if (rotate) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-4 p-4 text-center bg-ground">
        <Smartphone size={32} className="text-blue" />
        <p className="text-app-title-card text-ink">Xoay dọc điện thoại</p>
        <p className="text-app-note text-grey">MoonSafe dùng màn hình dọc trên điện thoại.</p>
      </div>
    )
  }

  const inner = (
    <div className={clsx('h-full flex flex-col min-h-0', frameInner(mode))}>
      {nav}
      <div className={clsx('flex-1 min-h-0 flex flex-col w-full mx-auto', mode === 'landscape' && 'max-w-[624px]')}>
        {children}
      </div>
    </div>
  )

  if (mode === 'landscape') {
    return (
      <div className="h-dvh bg-mist flex items-center justify-center p-12">
        <div className="w-full max-w-[1056px] h-full max-h-[880px] bg-ground rounded-md shadow-y2 overflow-hidden">{inner}</div>
      </div>
    )
  }
  return <div className="h-dvh bg-ground">{inner}</div>
}

function frameInner(mode: FrameMode) {
  if (mode === 'portrait') return 'max-w-[480px] mx-auto px-4 pt-[max(16px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))]'
  if (mode === 'square') return 'max-w-[768px] mx-auto px-6 md:px-14 pt-8 pb-8'
  return 'px-14 pt-10 pb-8'
}

export { useFrame }
