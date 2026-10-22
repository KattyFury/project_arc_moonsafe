import { BarChart3, Lock, MessageCircle, MoreHorizontal, TrendingUp, Vault, type LucideIcon } from 'lucide-react'

export type NavTab = 'chat' | 'fund' | 'invest' | 'balance' | 'menu'

interface NavBarProps {
  active: NavTab
  onChange: (tab: NavTab) => void
  investLocked: boolean
}

const tabs: Array<{ id: NavTab; label: string; icon: LucideIcon }> = [
  { id: 'chat',    label: 'Chat',    icon: MessageCircle },
  { id: 'fund',    label: 'Quỹ',     icon: Vault },
  { id: 'invest',  label: 'Đầu tư',  icon: TrendingUp },
  { id: 'balance', label: 'Cân đối', icon: BarChart3 },
  { id: 'menu',    label: 'Menu',    icon: MoreHorizontal },
]

export function NavBar({ active, onChange, investLocked }: NavBarProps) {
  return (
    <nav className="flex-shrink-0 flex items-stretch bg-white border-b z-20 relative" style={{ borderColor: 'var(--border)', height: 56 }}>
      {tabs.map(({ id, label, icon: Icon }) => {
        const locked = id === 'invest' && investLocked
        const isActive = active === id
        const color = isActive ? 'var(--accent)' : locked ? 'var(--border-lock)' : 'var(--muted)'
        return (
          <button key={id} onClick={() => onChange(id)} aria-pressed={isActive}
            className="relative flex-1 flex flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-60">
            {locked && !isActive ? <Lock size={18} style={{ color }} /> : (
              <Icon size={20} style={{ color, strokeWidth: isActive ? 2.2 : 1.7 }} />
            )}
            <span className="text-[10px] font-semibold tracking-wide" style={{ color }}>{label}</span>
            {isActive && <span className="absolute bottom-0 h-[2px] w-8 rounded-full" style={{ background: 'var(--accent)' }} />}
          </button>
        )
      })}
    </nav>
  )
}
