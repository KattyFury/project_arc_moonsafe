// Several things declared in one message are shown here one by one (Hieu, 2026-10-28): "Salary 150 USDC a month  1/6",
// Confirm saves that item and moves to the next, Cancel drops it. Nothing reaches the balance before it is confirmed.
// Pure props (no app context), so the card can be rendered anywhere; ChatScreen passes the profile's apply.

import { Check } from 'lucide-react'
import type { ProfileOp } from '@/lib/profile'
import { Btn, GlassCard, IconBox } from '@/components/ui/kit'

/** Same height for every step and for the summary: 16 + 72 (text) + 16 + 48 (buttons) + 16 + 32 (Confirm all) + 16. */
const FRAME = 'min-h-[216px]'

export interface PendingItem { text: string; ops: ProfileOp[]; status?: 'saved' | 'skipped' }

export function ItemsCard({ items, onChange, onSave, onFinished }: {
  items: PendingItem[]
  /** The items with their new status, to be stored. */
  onChange: (items: PendingItem[]) => void
  /** Apply the operations of the items the user confirmed. */
  onSave: (ops: ProfileOp[]) => void
  /** Every item has been confirmed or cancelled; the summary goes to the agent. */
  onFinished: (summary: string) => void
}) {
  const index = items.findIndex(i => !i.status)
  const total = items.length
  const settle = (statuses: Array<'saved' | 'skipped' | undefined>) => {
    const next = items.map((it, k) => ({ ...it, status: statuses[k] ?? it.status }))
    const toSave = next.flatMap((it, k) => statuses[k] === 'saved' ? it.ops : [])
    if (toSave.length) onSave(toSave)
    onChange(next)
    if (next.every(i => i.status)) {
      const saved = next.filter(i => i.status === 'saved').map(i => i.text)
      const skipped = next.filter(i => i.status === 'skipped').map(i => i.text)
      onFinished(`saved: ${saved.join('; ') || 'none'}. skipped: ${skipped.join('; ') || 'none'}.`)
    }
  }
  const mark = (status: 'saved' | 'skipped') => settle(items.map((_, k) => k === index ? status : undefined))
  const confirmAll = () => settle(items.map((it, k) => it.status ? undefined : 'saved'))

  if (index === -1) {
    const saved = items.filter(i => i.status === 'saved').length
    return (
      <GlassCard className={`ml-10 p-4 flex items-center gap-4 ${FRAME}`}>
        <IconBox tone="blue"><Check size={24} style={{ color: 'var(--accent)' }} /></IconBox>
        <p className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>
          {saved === 0 ? 'Nothing saved' : `Saved ${saved} of ${total}`}
          {saved < total && <span className="font-normal" style={{ color: 'var(--subtle)' }}>{`  ·  skipped ${total - saved}`}</span>}
        </p>
      </GlassCard>
    )
  }

  const left = items.filter(i => !i.status).length
  return (
    <GlassCard className={`ml-10 p-4 flex flex-col gap-4 ${FRAME}`}>
      <div className="flex items-start justify-between gap-4">
        {/* Room for three lines is always reserved (Hieu, 2026-10-28): a longer item never pushes the buttons, a shorter one leaves the space. */}
        <p className="text-[16px] leading-6 font-semibold break-words min-w-0 min-h-[72px] line-clamp-3" style={{ color: 'var(--ink)' }}>{items[index].text}</p>
        <span className="text-[14px] leading-6 font-semibold tabular-nums flex-shrink-0" style={{ color: 'var(--subtle)' }}>{index + 1}/{total}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Btn onClick={() => mark('saved')}>Confirm</Btn>
        <Btn variant="outline" onClick={() => mark('skipped')}>Cancel</Btn>
      </div>
      {/* Always in the layout (hidden when fewer than 3 are left), so the card keeps its height from the first item to the last. */}
      <button onClick={confirmAll} disabled={left < 3} tabIndex={left < 3 ? -1 : 0} aria-hidden={left < 3}
        className={`text-[14px] leading-5 font-semibold text-center min-h-8 ${left < 3 ? 'invisible' : ''}`} style={{ color: 'var(--accent)' }}>
        Confirm all {left}
      </button>
    </GlassCard>
  )
}
