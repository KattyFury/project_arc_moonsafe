// Figma component MoonSafe/Nav. Mobile: 5 tabs (icon 24 + 14 semibold, 64 high, 2px Blue
// underline on the active tab). Desktop: 72 bar with the logo lockup, tabs as pills
// (active = Blue Soft) and the wallet chip.

import { useState } from 'react'
import { BarChart3, Copy, Lock, MessageCircle, MoreHorizontal, TrendingUp, Vault, type LucideIcon } from 'lucide-react'
import { useAccount } from 'wagmi'
import { Wordmark } from '@/components/ui/kit'

export type NavTab = 'chat' | 'fund' | 'invest' | 'balance' | 'menu'

interface NavBarProps {
  active: NavTab
  onChange: (tab: NavTab) => void
  investLocked: boolean
}

const tabs: Array<{ id: NavTab; label: string; icon: LucideIcon }> = [
  { id: 'chat',    label: 'Chat',    icon: MessageCircle },
  { id: 'fund',    label: 'Fund',    icon: Vault },
  { id: 'invest',  label: 'Invest',  icon: TrendingUp },
  { id: 'balance', label: 'Balance', icon: BarChart3 },
  { id: 'menu',    label: 'Menu',    icon: MoreHorizontal },
]

export function NavBar({ active, onChange, investLocked }: NavBarProps) {
  return (
    <>
      <nav className="lg:hidden flex-shrink-0 flex items-stretch h-16 bg-white z-20" style={{ borderBottom: '1px solid var(--line)' }}>
        {tabs.map(({ id, label, icon: Icon }) => {
          const locked = id === 'invest' && investLocked
          const isActive = active === id
          const color = isActive ? 'var(--accent)' : 'var(--muted)'
          return (
            <button key={id} onClick={() => onChange(id)} aria-pressed={isActive}
              className="relative flex-1 flex flex-col items-center justify-center">
              {locked && !isActive ? <Lock size={24} style={{ color }} /> : <Icon size={24} style={{ color }} />}
              <span className="text-[14px] leading-5 font-semibold" style={{ color }}>{label}</span>
              {isActive && <span className="absolute bottom-0 inset-x-0 h-[2px]" style={{ background: 'var(--accent)' }} />}
            </button>
          )
        })}
      </nav>

      <nav className="hidden lg:block flex-shrink-0 bg-white z-20" style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="max-w-[1248px] mx-auto px-6 h-[72px] flex items-center justify-between">
          <Wordmark size={20} />
          <div className="flex gap-2">
            {tabs.map(({ id, label, icon: Icon }) => {
              const locked = id === 'invest' && investLocked
              const isActive = active === id
              const color = isActive ? 'var(--accent-dark)' : locked ? 'var(--muted)' : 'var(--subtle)'
              return (
                <button key={id} onClick={() => onChange(id)} aria-pressed={isActive}
                  className="h-10 px-4 flex items-center gap-2 rounded-full"
                  style={{ background: isActive ? 'var(--accent-soft)' : 'transparent' }}>
                  {locked && !isActive ? <Lock size={20} style={{ color }} /> : <Icon size={20} style={{ color }} />}
                  <span className="text-[16px] leading-6 font-semibold" style={{ color }}>{label}</span>
                </button>
              )
            })}
          </div>
          <WalletChip />
        </div>
      </nav>
    </>
  )
}

function WalletChip() {
  const { address } = useAccount()
  const [copied, setCopied] = useState(false)
  if (!address) return <span />
  const copy = () => { void navigator.clipboard?.writeText(address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }
  return (
    <button onClick={copy} className="h-10 px-4 flex items-center gap-2 rounded-full" style={{ background: 'var(--surface-muted)' }} title="Copy wallet address">
      <span className="text-[14px] leading-5 font-semibold" style={{ color: 'var(--ink)' }}>
        {copied ? 'Copied' : `${address.slice(0, 6)}…${address.slice(-4)}`}
      </span>
      <Copy size={16} style={{ color: 'var(--subtle)' }} />
    </button>
  )
}
