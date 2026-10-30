// The first questions inside the chat (Hieu, 2026-10-28), as at most FOUR steps of the same size (Hieu, 2026-10-30; six cards before):
// Plan for → About you → Assets → Goals & debt. Only what the plan needs is asked: age, salary, spending, income steadiness, dependents, cash
// and stablecoins, investments, a big expense within 5 years, debt. Home / car / business, passive income, airdrops, the number of
// dependents, the goal's name and who a debt is owed to were dropped (the agent can still ask in chat). Skip clears the card,
// Next keeps it; the last card saves straight away (sending is the user's confirmation). Pure props (no app context).

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

function Num({ label, hint, value, onChange, suffix = '', money = true }: { label: string; hint?: string; value: string; onChange: (v: string) => void; suffix?: string; money?: boolean }) {
  return (
    <Field label={label} hint={hint}>
      <div className={BOX} style={{ background: 'var(--surface-muted)' }}>
        {money && <span className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--subtle)' }}>$</span>}
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

interface Step { key: string; title: string; fields: (keyof FormValues)[]; view: ReactNode }

export function IntakeFormCard({ keys, seen, values, planningScope, status, saved, prices, onChange, onReview, onSkip }: {
  /** The sections still unknown (functions/_lib/intake.ts keys). */
  keys: string[]
  /** USDC the app sees in the connected wallet: a hint, never a total. */
  seen: number | null
  values: FormValues
  planningScope?: 'individual' | 'household'
  status?: 'done' | 'cancelled'
  /** How many details the form saved when it was sent. */
  saved?: number
  prices: Prices | null
  onChange: (v: FormValues) => void
  onReview: (v: FormValues) => void
  onSkip: () => void
}) {
  const [at, setAt] = useState(0)
  const household = (values.planningScope ?? planningScope) === 'household'

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
  const seenText = seen !== null && seen >= 1 ? `I can see ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.floor(seen))} USDC here` : undefined

  const steps: Step[] = []
  const step = (key: string, title: string, fields: (keyof FormValues)[], view: ReactNode) => steps.push({ key, title, fields, view })

  // At most four steps (Hieu, 2026-10-30): Plan for → About you → Assets → Goals & debt. "Plan for" is its own step, asked once.
  // From 640px wide the fields sit two to a row, so a card stays short on a laptop.
  step('plan', 'Plan for', ['planningScope'], <>
    <Toggle value={values.planningScope ?? planningScope ?? 'individual'} options={[{ value: 'individual' as const, label: 'Just me' }, { value: 'household' as const, label: 'Household' }]} onChange={set('planningScope')} />
    <p className="text-[14px] leading-5" style={{ color: 'var(--muted)' }}>{household
      ? 'Shared totals count once. The allocation uses your age; a working partner is not automatically a dependent.'
      : 'One current plan. Changing scope keeps existing entries; review them.'}</p>
  </>)
  const you = has('age') || has('income') || has('spending') || has('stability')
  if (you) step('you', 'About you', ['age', 'salary', 'spending', 'steady', 'reliers', 'reliersCount', 'onlyEarner'], <>
    <div className="grid grid-cols-2 gap-4">
      {has('age') && <Num label={household ? 'Your age (for this plan)' : 'Your age'} value={values.age} onChange={set('age')} money={false} />}
      {has('income') && <Num label={household ? 'Combined salary a month' : 'Salary a month'} value={values.salary} onChange={set('salary')} />}
      {has('spending') && <div className="col-span-2"><Num label={household ? 'Household spending a month' : 'Spending a month (an estimate is fine)'} value={values.spending} onChange={set('spending')} /></div>}
    </div>
    {has('stability') && <div className="grid grid-cols-2 gap-4">
      <Ask label={household ? 'Combined income steady?' : 'Is your income steady?'} value={values.steady} onChange={set('steady')} />
      <Ask label={household ? 'Anyone depends on it?' : 'Does anyone rely on it?'} value={values.reliers} onChange={set('reliers')} />
      {values.reliers === 'yes' && <Num label="How many dependents?" value={values.reliersCount} onChange={set('reliersCount')} money={false} />}
      {household && <Ask label="Only one person earning?" value={values.onlyEarner ?? null} onChange={set('onlyEarner')} />}
    </div>}
  </>)
  if (has('assets')) step('assets', 'Assets', ['bank', 'usdcThis', 'crypto', 'gold', 'stocks'], <>
    <Num label="Bank savings and cash" value={values.bank} onChange={set('bank')} />
    <div className="grid grid-cols-2 gap-4">
      <Num label="Stablecoin onchain" hint={seenText} value={values.usdcThis} onChange={set('usdcThis')} />
      <Num label="Crypto" value={values.crypto ?? ''} onChange={set('crypto')} />
      <Num label="Gold" value={values.gold} onChange={set('gold')} />
      <Num label="Stocks, funds" value={values.stocks} onChange={set('stocks')} />
    </div>
  </>)
  if (has('goal') || has('debt')) step('later', 'Goals & debt', ['goal', 'goalAmount', 'goalYears', 'debt', 'debtOwed', 'debtRate', 'debtMonthly'], <>
    {has('goal') && <Ask label="A big expense in the next 5 years (car, wedding, school)?" value={values.goal} onChange={set('goal')} />}
    {has('goal') && values.goal === 'yes' && (
      <div className="grid grid-cols-2 gap-4">
        <Num label="How much?" value={values.goalAmount} onChange={set('goalAmount')} />
        <Num label="In how many years?" value={values.goalYears} onChange={set('goalYears')} money={false} />
      </div>
    )}
    {has('debt') && <Ask label="Any debt, family loans included?" value={values.debt} onChange={set('debt')} />}
    {has('debt') && values.debt === 'yes' && (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="col-span-2 sm:col-span-1"><Num label="Total you still owe" value={values.debtOwed} onChange={set('debtOwed')} /></div>
        <Num label="Interest a year" value={values.debtRate} onChange={set('debtRate')} suffix="%" money={false} />
        <Num label="You pay a month" value={values.debtMonthly} onChange={set('debtMonthly')} />
      </div>
    )}
  </>)

  if (!steps.length) return null
  const i = Math.min(at, steps.length - 1)
  const cur = steps[i]
  const last = i === steps.length - 1
  const count = formToItems({ ...EMPTY_FORM, ...values, planningScope: values.planningScope ?? planningScope }, prices).length
  const next = (v: FormValues) => { if (last) onReview({ ...v, planningScope: v.planningScope ?? planningScope }); else setAt(i + 1) }
  // Skip: this question's answer is cleared ("prefer not to say"), then the next question (or save, on the last one).
  const skip = () => {
    const cleared: FormValues = { ...values }
    for (const f of cur.fields) (cleared as unknown as Record<string, unknown>)[f] = EMPTY_FORM[f]
    onChange(cleared)
    if (last && formToItems({ ...EMPTY_FORM, ...cleared, planningScope: cleared.planningScope ?? planningScope }, prices).length === 0) onSkip()
    else next(cleared)
  }

  return (
    <GlassCard className="ml-10 p-4 flex flex-col gap-4 w-[calc(100%-40px)] max-w-[480px] sm:max-w-[640px]">
      <div className="flex items-center gap-2">
        {i > 0
          ? <button onClick={() => setAt(i - 1)} aria-label="Previous question" className="w-8 h-8 -ml-2 flex items-center justify-center rounded-full" style={{ color: 'var(--subtle)' }}><ChevronLeft size={20} /></button>
          : <ClipboardList size={20} style={{ color: 'var(--accent)' }} />}
        <p className="flex-1 min-w-0 truncate text-[14px] leading-5 font-semibold tabular-nums" style={{ color: 'var(--subtle)' }}>{i + 1} of {steps.length} · <span style={{ color: 'var(--ink)' }}>{cur.title}</span></p>
        <button onClick={onSkip} className="h-8 px-2 text-[14px] leading-5 font-semibold" style={{ color: 'var(--subtle)' }}>Skip all</button>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--line)' }} aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${Math.round(((i + 1) / steps.length) * 100)}%`, background: 'var(--accent)' }} />
      </div>

      {/* Every step starts at the same size; a Yes that opens more fields (dependents, the goal, the debt) lets it grow instead of scrolling. */}
      <div key={cur.key} className="min-h-[320px] sm:min-h-[288px] flex flex-col gap-4">{cur.view}</div>

      <div className="grid grid-cols-2 gap-2">
        <Btn variant="outline" onClick={skip}>Skip</Btn>
        <Btn disabled={last && count === 0} onClick={() => next(values)}>{last ? (count ? `Save ${count}` : 'Save') : 'Next'}</Btn>
      </div>
    </GlassCard>
  )
}
