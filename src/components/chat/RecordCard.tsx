// Confirmation box for money the user says they placed ("I put 1,000 in my bank as Safety").
// The user picks where it came from and confirms; only then is it saved to the profile, so the
// agent never records it from a guess (real chat 2026-10-27). Nothing is signed or sent onchain.

import { useState } from 'react'
import { Check, Landmark } from 'lucide-react'
import { useApp } from '@/state/AppState'
import { bucketLabel, buildRecordOps, recordSummary, sourceOptions, type RecordRequest, type RecordSource } from '@/lib/record'
import { Btn, GlassCard, IconBox, Notice } from '@/components/ui/kit'
import { EMPTY_PROFILE } from '@/types'

type Choice = 'wallet' | 'new' | `h:${string}`

export function RecordCard({ record, status: saved, onFinished }: { record: RecordRequest; status?: 'done' | 'cancelled'; onFinished: (status: 'done' | 'cancelled', summary: string) => void }) {
  const { profile, fx, money } = useApp()
  const [status, setStatus] = useState<'idle' | 'done' | 'cancelled'>(saved ?? 'idle')
  const [choice, setChoice] = useState<Choice | null>(record.source)
  const rate = fx.vndPerUsd
  const current = profile.profile ?? EMPTY_PROFILE
  const sources = sourceOptions(current, record, rate)
  const amountText = money(BigInt(Math.round(record.amountUsd * 1_000_000)))

  const toSource = (c: Choice): RecordSource => c === 'wallet' ? { kind: 'wallet' } : c === 'new' ? { kind: 'new' } : { kind: 'holding', id: c.slice(2) }
  const confirm = () => {
    if (!choice) return
    const source = toSource(choice)
    profile.apply(buildRecordOps(current, record, source, rate))
    setStatus('done')
    onFinished('done', recordSummary(record, source, current))
  }
  const cancel = () => { setStatus('cancelled'); onFinished('cancelled', 'Cancelled.') }

  const options: { value: Choice; label: string; sub: string }[] = [
    { value: 'wallet', label: 'My app wallet', sub: 'USDC I hold in this app' },
    ...sources.map(h => ({ value: `h:${h.id}` as Choice, label: h.name, sub: 'Money I already listed' })),
    { value: 'new', label: 'New money', sub: 'Not in the app yet (salary, airdrop, a gift)' },
  ]

  return (
    <GlassCard className="ml-10 p-4 flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <IconBox><Landmark size={24} style={{ color: 'var(--accent)' }} /></IconBox>
        <div className="min-w-0">
          <p className="text-[14px] leading-5 font-semibold" style={{ color: 'var(--subtle)' }}>Save to your balance?</p>
          <p className="display font-bold text-[24px] leading-8 tabular-nums" style={{ color: 'var(--ink)' }}>{amountText}</p>
          <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>In {record.name} · {bucketLabel(record.holdingType)}</p>
        </div>
      </div>

      {status === 'done' ? (
        <Notice tone="success" title={`Saved: ${amountText} in ${record.name}.`} />
      ) : status === 'cancelled' ? (
        <p className="text-[14px] leading-5" style={{ color: 'var(--muted)' }}>Not saved. Tell me again whenever you want to record it.</p>
      ) : (
        <>
          <div role="radiogroup" aria-label="Where did this money come from?" className="flex flex-col gap-2">
            <p className="text-[14px] leading-5 font-semibold" style={{ color: 'var(--ink)' }}>Where did this money come from?</p>
            {options.map(o => {
              const on = choice === o.value
              return (
                <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => setChoice(o.value)}
                  className="w-full min-h-[48px] px-4 py-2 rounded-2xl text-left flex items-center gap-4 border-2"
                  style={{ borderColor: on ? 'var(--accent)' : 'var(--line)', background: on ? 'var(--surface-muted)' : 'transparent' }}>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[16px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>{o.label}</span>
                    <span className="block text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>{o.sub}</span>
                  </span>
                  {on && <Check size={20} style={{ color: 'var(--accent)' }} />}
                </button>
              )
            })}
          </div>
          <div className="flex gap-4">
            <Btn variant="outline" onClick={cancel}>Not now</Btn>
            <Btn variant="primary" disabled={!choice} onClick={confirm}>Confirm and save</Btn>
          </div>
        </>
      )}
    </GlassCard>
  )
}
