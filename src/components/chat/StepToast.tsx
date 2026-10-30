// The four-step path (Hieu, 2026-10-22: cash flow → emergency fund → balance → invest), shown at the top of the chat only when a step
// is completed (Hieu, 2026-10-30, option C): a small card with a few confetti pieces that hides itself after a few seconds. Progress
// already reached before (or on another device) is remembered per account and never celebrated twice.

import { useEffect, useState } from 'react'
import { PartyPopper, X } from 'lucide-react'
import { usePrivy } from '@privy-io/react-auth'
import { useApp } from '@/state/AppState'

const KEY = 'moonsafe_steps_seen_v1'
const SHOW_MS = 8000
const CONFETTI = ['#1E6DF7', '#1baf7a', '#eb6834', '#F5B301', '#1E6DF7', '#1baf7a']

function readSeen(user: string): number | null {
  try { const v = (JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>)[user]; return typeof v === 'number' ? v : null } catch { return null }
}
function writeSeen(user: string, n: number) {
  try { const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>; all[user] = n; localStorage.setItem(KEY, JSON.stringify(all)) } catch { /* storage blocked */ }
}

export function StepToast() {
  const { balance: b, math, cloud } = useApp()
  const { user } = usePrivy()
  // Steps done, in order: 1 cash flow known, 2 emergency fund full, 3 the base is solid (fund full, no priority debt: Invest opens).
  const done = b.cashflow.income === null || b.cashflow.spending === null ? 0 : !math.fundOk ? 1 : !math.investUnlocked ? 2 : 3
  const [shown, setShown] = useState<number | null>(null)

  useEffect(() => {
    if (!user?.id || !cloud.ready) return
    const seen = readSeen(user.id)
    writeSeen(user.id, done)
    // The first time this account is seen, its progress so far is taken as known, not celebrated.
    // Shown from a microtask: the effect only syncs with storage, the card itself is ordinary state.
    if (seen !== null && done > seen) void Promise.resolve().then(() => setShown(done))
  }, [done, user?.id, cloud.ready])

  useEffect(() => {
    if (shown === null) return
    const id = setTimeout(() => setShown(null), SHOW_MS)
    return () => clearTimeout(id)
  }, [shown])

  if (shown === null) return null
  const floor = b.fund.floorUsd !== null ? `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(b.fund.floorUsd)}` : null
  const [title, next] = shown === 1 ? ['Step 1 of 4 done: cash flow is clear', `Next up: your emergency fund${floor ? `, ${floor}` : ''}.`]
    : shown === 2 ? ['Step 2 of 4 done: your emergency fund is full', 'Next up: balance the rest. The Balance tab is open.']
    : ['Step 3 of 4 done: your base is solid', 'Next up: invest at your own pace. The Invest tab is open.']

  return (
    <div role="status" className="absolute top-2 inset-x-2 z-20 lg:inset-x-6 lg:top-4">
      {CONFETTI.map((c, k) => (
        <i key={k} aria-hidden className="confetti absolute block rounded-[2px]"
          style={{ top: k % 2 ? 0 : 6, left: `${6 + k * 17}%`, width: k % 2 ? 6 : 8, height: k % 2 ? 10 : 6, background: c, transform: `rotate(${k * 35}deg)`, animationDelay: `${k * 60}ms` }} />
      ))}
      <div className="sheet-in mt-3 p-4 flex items-center gap-4 rounded-[20px]" style={{ background: 'var(--bg)', border: '1px solid var(--line)', boxShadow: '0 12px 32px rgba(15,61,178,0.16)' }}>
        <span className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#E3F5EC', color: '#1baf7a' }}><PartyPopper size={22} /></span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] leading-5 font-semibold" style={{ color: 'var(--ink)' }}>{title}</p>
          <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>{next}</p>
          <div className="mt-2 flex gap-1" aria-hidden>
            {[1, 2, 3, 4].map(k => <span key={k} className="flex-1 h-1 rounded-full" style={{ background: k <= shown ? '#1baf7a' : k === shown + 1 ? 'var(--accent)' : 'var(--line)' }} />)}
          </div>
        </div>
        <button onClick={() => setShown(null)} aria-label="Close" className="self-start w-6 h-6 flex items-center justify-center" style={{ color: 'var(--muted)' }}><X size={16} /></button>
      </div>
    </div>
  )
}
