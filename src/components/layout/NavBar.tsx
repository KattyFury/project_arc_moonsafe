import { MessageCircle, Vault, TrendingUp, BarChart3, MoreHorizontal, type LucideIcon } from 'lucide-react'

export type NavTab = 'chat' | 'fund' | 'invest' | 'balance' | 'menu'

interface NavBarProps {
  active: NavTab
  onChange: (tab: NavTab) => void
  investLocked: boolean
  balanceLocked: boolean
}

const tabs: Array<{ id: NavTab; label: string; icon: LucideIcon; lockable?: boolean }> = [
  { id: 'chat',    label: 'Chat',    icon: MessageCircle },
  { id: 'fund',    label: 'Quỹ',     icon: Vault },
  { id: 'invest',  label: 'Đầu tư',  icon: TrendingUp,  lockable: true },
  { id: 'balance', label: 'Cân đối', icon: BarChart3 },
  { id: 'menu',    label: 'Menu',    icon: MoreHorizontal },
]

export function NavBar({ active, onChange, investLocked }: NavBarProps) {
  return (
    <nav
      className="flex-shrink-0 flex items-stretch bg-white border-b z-20"
      style={{ borderColor: 'var(--border)', height: 56 }}
    >
      {tabs.map(({ id, label, icon: Icon, lockable }) => {
        const locked = lockable && id === 'invest' && investLocked
        const isActive = active === id
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="flex-1 flex flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-60"
            style={{ opacity: locked ? 0.4 : 1 }}
          >
            <Icon
              size={20}
              style={{ color: isActive ? 'var(--accent)' : 'var(--muted)', strokeWidth: isActive ? 2.2 : 1.7 }}
            />
            <span
              className="text-[10px] font-semibold tracking-wide"
              style={{ color: isActive ? 'var(--accent)' : 'var(--muted)' }}
            >
              {label}
            </span>
            {isActive && (
              <span
                className="absolute bottom-0 h-[2px] w-8 rounded-full"
                style={{ background: 'var(--accent)' }}
              />
            )}
          </button>
        )
      })}
    </nav>
  )
}
