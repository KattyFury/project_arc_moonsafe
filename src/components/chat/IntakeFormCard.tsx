// The first questions inside the chat (Hieu, 2026-10-28), ONE question per card (Hieu, 2026-10-29: the whole form at once was too
// big on a computer and confused people). Skip clears the answer and moves on, Next keeps it. Whatever is skipped is "prefer not to
// say". The last step's button saves: the values become items (src/lib/intakeForm.ts) and are saved straight away, sending is the
// user's confirmation. Pure props (no app context).

import { useState, type ReactNode } from 'react'
import { ChevronLeft, ClipboardList } from 'lucide-react'
import { Btn, GlassCard, IconBox, Toggle } from '@/components/ui/kit'
import { EMPTY_FORM, formToItems, type FormValues, type SectionKey, type YesNo } from '@/lib/intakeForm'
import type { Prices } from '@/lib/allocation'

const YES_NO = [{ value: 'yes' as const, label: 'Yes' }, { value: 'no' as const, label: 'No' }]

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[14px] leading-5 font-semibold" style={{ color: 'var(--subtle)' }}>{label}</span>
      {children}
      {hint && <span className="text-[14px] leading-5" style={{ color: 'var(--muted)' }}>{hint}</span>}
    </label>
  )
}

const BOX = 'h-12 flex items-center gap-2 px-4 rounded-2xl border border-[var(--line)] focus-within:border-[var(--accent)] focus-within:shadow-[inset_0_0_0_1px_var(--accent)]'

function Num({ label, hint, value, onChange, suffix = 'USDC' }: { label: string; hint?: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <Field label={label} hint={hint}>
      <div className={BOX} style={{ background: 'var(--surface-muted)' }}>
        <input inputMode="decimal" value={value} placeholder="0" aria-label={label}
          onChange={e => onChange(e.target.value.replace(/[^0-9.,kKmM$ ]/g, '').slice(0, 14))}
          className="flex-1 min-w-0 bg-transparent text-[16px] leading-6 tabular-nums outline-none placeholder:text-[var(--muted)]" style={{ color: 'var(--ink)' }} />
        {suffix && <span className="text-[14px] leading-5 font-semibold" style={{ color: 'var(--subtle)' }}>{suffix}</span>}
      </div>
    </Field>
  )
}

function Ask({ label, value, onChange }: { label: string; value: YesNo; onChange: (v: 'yes' | 'no') => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[14px] leading-5 font-semibold" style={{ color: 'var(--subtle)' }}>{label}</span>
      <Toggle value={value} options={YES_NO} onChange={onChange} />
    </div>
  )
}

interface Step { key: string; fields: (keyof FormValues)[]; view: ReactNode }

export function IntakeFormCard({ keys, seen, values, status, saved, prices, onChange, onReview, onSkip }: {
  /** The sections still unknown (functions/_lib/intake.ts keys). */
  keys: string[]
  /** USDC the app sees in the connected wallet: a hint, never a total. */
  seen: number | null
  values: FormValues
  status?: 'done' | 'cancelled'
  /** How many details the form saved when it was sent. */
  saved?: number
  prices: Prices | null
  onChange: (v: FormValues) => void
  onReview: (v: FormValues) => void
  onSkip: () => void
}) {
  const [at, setAt] = useState(0)

  if (status) {
    return (
      <GlassCard className="ml-10 p-4 flex items-center gap-4">
        <IconBox><ClipboardList size={24} style={{ color: 'var(--accent)' }} /></IconBox>
        <p className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>{saved ? `Saved ${saved} ${saved === 1 ? 'detail' : 'details'}` : 'Details sent'}</p>
      </GlassCard>
    )
  }

  const has = (k: SectionKey) => keys.includes(k)
  const set = <K extends keyof FormValues>(k: K) => (v: FormValues[K]) => onChange({ ...values, [k]: v })
  const seenText = seen !== null && seen >= 1 ? `I can see ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.floor(seen))} USDC in this wallet` : undefined

  const steps: Step[] = []
  const step = (key: string, fields: (keyof FormValues)[], view: ReactNode) => steps.push({ key, fields, view })

  if (has('age')) step('age', ['age'], <Num label="Your age" value={values.age} onChange={set('age')} suffix="" />)
  if (has('income')) {
    step('salary', ['salary'], <Num label="Your salary a month" value={values.salary} onChange={set('salary')} />)
    step('other-income', ['otherIncome', 'passive', 'windfalls', 'windfallsYearly'], <>
      <Ask label="Any other income?" value={values.otherIncome} onChange={set('otherIncome')} />
      {values.otherIncome === 'yes' && (
        <>
          <Num label="Passive income a month (interest, staking, rent)" value={values.passive} onChange={set('passive')} />
          <Ask label="Airdrops or other income that comes only now and then?" value={values.windfalls} onChange={set('windfalls')} />
          {values.windfalls === 'yes' && <Num label="About how much a year?" hint="Noted, but not counted as monthly income: it cannot be relied on." value={values.windfallsYearly} onChange={set('windfallsYearly')} />}
        </>
      )}
    </>)
  }
  if (has('spending')) step('spending', ['spending'], <Num label="What you spend a month" hint="An estimate is fine." value={values.spending} onChange={set('spending')} />)
  if (has('stability')) {
    step('steady', ['steady'], <Ask label="Is your income steady?" value={values.steady} onChange={set('steady')} />)
    step('reliers', ['reliers', 'reliersCount'], <>
      <Ask label="Does anyone rely on your income?" value={values.reliers} onChange={set('reliers')} />
      {values.reliers === 'yes' && <Num label="How many people?" value={values.reliersCount} onChange={set('reliersCount')} suffix="" />}
    </>)
  }
  if (has('goal')) step('goal', ['goal', 'goalName', 'goalAmount', 'goalYears'], <>
    <Ask label="A big expense in the next 5 years?" value={values.goal} onChange={set('goal')} />
    {values.goal === 'yes' && (
      <>
        <Field label="What for?">
          <div className={BOX} style={{ background: 'var(--surface-muted)' }}>
            <input value={values.goalName} placeholder="A wedding, a car…" aria-label="What for?" maxLength={40} onChange={e => set('goalName')(e.target.value)}
              className="flex-1 min-w-0 bg-transparent text-[16px] leading-6 outline-none placeholder:text-[var(--muted)]" style={{ color: 'var(--ink)' }} />
          </div>
        </Field>
        <Num label="How much?" value={values.goalAmount} onChange={set('goalAmount')} />
        <Num label="In how many years?" value={values.goalYears} onChange={set('goalYears')} suffix="" />
      </>
    )}
  </>)
  if (has('assets')) {
    step('usdc-this', ['usdcThis'], <Num label="USDC in this wallet" hint={seenText} value={values.usdcThis} onChange={set('usdcThis')} />)
    step('usdc-else', ['usdcElsewhere'], <Num label="USDC or USDT in other wallets or exchanges" value={values.usdcElsewhere} onChange={set('usdcElsewhere')} />)
    step('bank', ['bank'], <Num label="Bank savings" value={values.bank} onChange={set('bank')} />)
    step('cash', ['cash'], <Num label="Cash" value={values.cash} onChange={set('cash')} />)
    step('btc', ['btc'], <Num label="Bitcoin, value today" value={values.btc} onChange={set('btc')} />)
    step('alts', ['coins'], <Num label="Altcoins, value today" hint="Every coin other than Bitcoin, together." value={values.coins} onChange={set('coins')} />)
    step('gold', ['gold'], <Num label="Gold, value today" value={values.gold} onChange={set('gold')} />)
    step('stocks', ['stocks'], <Num label="Stocks or funds, value today" value={values.stocks} onChange={set('stocks')} />)
  }
  if (has('other')) step('other', ['otherAssets', 'home', 'car', 'lent', 'business'], <>
    <Ask label="Do you own a home, land, a car or a business, or have you lent money?" value={values.otherAssets} onChange={set('otherAssets')} />
    {values.otherAssets === 'yes' && (
      <>
        <Num label="Home or land, value" value={values.home} onChange={set('home')} />
        <Num label="Car, value" value={values.car} onChange={set('car')} />
        <Num label="Money you lent" value={values.lent} onChange={set('lent')} />
        <Num label="A business you own, value" value={values.business} onChange={set('business')} />
      </>
    )}
  </>)
  if (has('debt')) step('debt', ['debt', 'debtKind', 'debtOwed', 'debtRate', 'debtMonthly'], <>
    <Ask label="Any debt?" value={values.debt} onChange={set('debt')} />
    {values.debt === 'yes' && (
      <>
        <div className="flex flex-col gap-2">
          <span className="text-[14px] leading-5 font-semibold" style={{ color: 'var(--subtle)' }}>Owed to</span>
          <Toggle value={values.debtKind} options={[{ value: 'bank' as const, label: 'Bank or card' }, { value: 'family' as const, label: 'Family or friends' }]} onChange={set('debtKind')} />
        </div>
        <Num label="Total you still owe" value={values.debtOwed} onChange={set('debtOwed')} />
        <Num label="Interest a year (0 if none)" value={values.debtRate} onChange={set('debtRate')} suffix="%" />
        <Num label="You pay a month" value={values.debtMonthly} onChange={set('debtMonthly')} />
      </>
    )}
  </>)

  if (!steps.length) return null
  const i = Math.min(at, steps.length - 1)
  const cur = steps[i]
  const last = i === steps.length - 1
  const count = formToItems({ ...EMPTY_FORM, ...values }, prices).length
  const next = (v: FormValues) => { if (last) onReview(v); else setAt(i + 1) }
  // Skip: this question's answer is cleared ("prefer not to say"), then the next question (or save, on the last one).
  const skip = () => {
    const cleared: FormValues = { ...values }
    for (const f of cur.fields) (cleared as unknown as Record<string, unknown>)[f] = EMPTY_FORM[f]
    onChange(cleared)
    if (last && formToItems({ ...EMPTY_FORM, ...cleared }, prices).length === 0) onSkip()
    else next(cleared)
  }

  return (
    <GlassCard className="ml-10 p-4 flex flex-col gap-4 max-w-[480px]">
      <div className="flex items-center gap-2">
        {i > 0
          ? <button onClick={() => setAt(i - 1)} aria-label="Previous question" className="w-8 h-8 -ml-2 flex items-center justify-center rounded-full" style={{ color: 'var(--subtle)' }}><ChevronLeft size={20} /></button>
          : <ClipboardList size={20} style={{ color: 'var(--accent)' }} />}
        <p className="flex-1 text-[14px] leading-5 font-semibold tabular-nums" style={{ color: 'var(--subtle)' }}>Question {i + 1} of {steps.length}</p>
        <button onClick={onSkip} className="h-8 px-2 text-[14px] leading-5 font-semibold" style={{ color: 'var(--subtle)' }}>Skip all</button>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--line)' }} aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${Math.round(((i + 1) / steps.length) * 100)}%`, background: 'var(--accent)' }} />
      </div>

      <div key={cur.key} className="flex flex-col gap-4">{cur.view}</div>

      <div className="grid grid-cols-2 gap-2">
        <Btn variant="outline" onClick={skip}>Skip</Btn>
        <Btn disabled={last && count === 0} onClick={() => next(values)}>{last ? (count ? `Save ${count}` : 'Save') : 'Next'}</Btn>
      </div>
    </GlassCard>
  )
}
