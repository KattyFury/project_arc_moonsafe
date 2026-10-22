// Row 1 navigation (SPEC §5).
// Portrait: 4 equal cells Quỹ / Đầu tư / Cân đối / Menu (wallet & settings live in Menu).
// Square + landscape: Quỹ / Đầu tư / Cân đối on the left; wallet (0x12…ab) + Menu on the right.
// Locked buttons: dashed border + lock icon, still tappable (they open the matching popup).

import { Lock, Menu, PiggyBank, Scale, TrendingUp, Wallet, type LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import type { Panel } from '@/types'
import { shortAddress } from '@/lib/format'
import type { FrameMode } from '@/hooks/useFrame'

const MAIN: { id: Panel; label: string; icon: LucideIcon }[] = [
  { id: 'fund', label: 'Quỹ', icon: PiggyBank },
  { id: 'invest', label: 'Đầu tư', icon: TrendingUp },
  { id: 'balance', label: 'Cân đối', icon: Scale },
]

interface NavBarProps {
  mode: FrameMode
  active: Panel | null
  locked: Partial<Record<Panel, boolean>>
  address?: string
  onSelect: (p: Panel) => void
}

export function NavBar({ mode, active, locked, address, onSelect }: NavBarProps) {
  if (mode === 'portrait') {
    const cells = [...MAIN, { id: 'settings' as Panel, label: 'Menu', icon: Menu }]
    return (
      <nav className="shrink-0 grid grid-cols-4 gap-2 mb-2" aria-label="Điều hướng">
        {cells.map(c => (
          <NavCell key={c.id} {...c} active={active === c.id} locked={!!locked[c.id]} onClick={() => onSelect(c.id)} />
        ))}
      </nav>
    )
  }
  return (
    <nav className="shrink-0 flex items-center justify-between gap-4 mb-4" aria-label="Điều hướng">
      <div className="flex gap-2">
        {MAIN.map(c => (
          <NavPill key={c.id} {...c} active={active === c.id} locked={!!locked[c.id]} onClick={() => onSelect(c.id)} />
        ))}
      </div>
      <div className="flex gap-2">
        <NavPill id="settings" label={shortAddress(address)} icon={Wallet} mono active={false} locked={false} onClick={() => onSelect('settings')} />
        <button onClick={() => onSelect('settings')} aria-label="Menu"
          className={clsx('w-12 h-12 rounded-md inline-flex items-center justify-center',
            active === 'settings' ? 'bg-blue-soft text-blue-strong' : 'bg-mist text-grey')}>
          <Menu size={24} />
        </button>
      </div>
    </nav>
  )
}

function NavCell({ label, icon: Icon, active, locked, onClick }: { label: string; icon: LucideIcon; active: boolean; locked: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={clsx('h-[72px] rounded-md flex flex-col items-center justify-center',
        locked ? 'border-2 border-dashed border-line text-muted'
          : active ? 'bg-blue-soft text-blue-strong' : 'bg-mist text-grey')}>
      {locked ? <Lock size={24} /> : <Icon size={24} />}
      <span className="text-app-btn-sm">{label}</span>
    </button>
  )
}

function NavPill({ label, icon: Icon, active, locked, mono, onClick }: { id: Panel; label: string; icon: LucideIcon; active: boolean; locked: boolean; mono?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={clsx('h-12 px-4 rounded-md inline-flex items-center gap-2 text-app-btn-sm',
        mono && 'mono',
        locked ? 'border-2 border-dashed border-line text-muted'
          : active ? 'bg-blue-soft text-blue-strong' : 'bg-mist text-grey')}>
      {locked ? <Lock size={20} /> : <Icon size={20} />}
      {label}
    </button>
  )
}
