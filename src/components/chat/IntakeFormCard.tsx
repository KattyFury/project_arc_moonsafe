// The first questions as a form inside the chat (Hieu, 2026-10-28): "Your age: [   ]", "Any other income? [Yes / No]".
// Whatever is left empty is "prefer not to say". "Review" turns the values into items (src/lib/intakeForm.ts) and shows them one by
// one in the confirm card; nothing is saved before that. Pure props (no app context), so it renders anywhere.

import type { ReactNode } from 'react'
import { ClipboardList } from 'lucide-react'
import { Btn, Caps, GlassCard, IconBox, Toggle } from '@/components/ui/kit'
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

export function IntakeFormCard({ keys, seen, values, status, prices, onChange, onReview, onSkip }: {
  /** The sections still unknown (functions/_lib/intake.ts keys). */
  keys: string[]
  /** USDC the app sees in the connected wallet: a hint, never a total. */
  seen: number | null
  values: FormValues
  status?: 'done' | 'cancelled'
  prices: Prices | null
  onChange: (v: FormValues) => void
  onReview: (v: FormValues) => void
  onSkip: () => void
}) {
  const has = (k: SectionKey) => keys.includes(k)
  const set = <K extends keyof FormValues>(k: K) => (v: FormValues[K]) => onChange({ ...values, [k]: v })
  const filled = formToItems({ ...EMPTY_FORM, ...values }, prices).length

  if (status) {
    return (
      <GlassCard className="ml-10 p-4 flex items-center gap-4">
        <IconBox><ClipboardList size={24} style={{ color: 'var(--accent)' }} /></IconBox>
        <p className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>Details sent</p>
      </GlassCard>
    )
  }

  const seenText = seen !== null && seen >= 1 ? `I can see ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.floor(seen))} USDC in this wallet` : undefined
  return (
    <GlassCard className="ml-10 p-4 flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <IconBox><ClipboardList size={24} style={{ color: 'var(--accent)' }} /></IconBox>
        <div>
          <p className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>Your details</p>
          <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Leave a field empty to skip it.</p>
        </div>
      </div>

      {has('age') && <Num label="Your age" value={values.age} onChange={set('age')} suffix="" />}

      {has('income') && (
        <>
          <Caps>Income</Caps>
          <Num label="Your salary a month" value={values.salary} onChange={set('salary')} />
          <Ask label="Any other income?" value={values.otherIncome} onChange={set('otherIncome')} />
          {values.otherIncome === 'yes' && (
            <>
              <Num label="Passive income a month (interest, staking, rent)" value={values.passive} onChange={set('passive')} />
              <Ask label="Airdrops or other income that comes only now and then?" value={values.windfalls} onChange={set('windfalls')} />
              {values.windfalls === 'yes' && <Num label="About how much a year?" hint="Noted, but not counted as monthly income: it cannot be relied on." value={values.windfallsYearly} onChange={set('windfallsYearly')} />}
            </>
          )}
        </>
      )}

      {has('spending') && <Num label="What you spend a month" hint="An estimate is fine." value={values.spending} onChange={set('spending')} />}

      {has('stability') && (
        <>
          <Ask label="Is your income steady?" value={values.steady} onChange={set('steady')} />
          <Ask label="Does anyone rely on your income?" value={values.reliers} onChange={set('reliers')} />
          {values.reliers === 'yes' && <Num label="How many people?" value={values.reliersCount} onChange={set('reliersCount')} suffix="" />}
        </>
      )}

      {has('goal') && (
        <>
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
        </>
      )}

      {has('assets') && (
        <>
          <Caps>What you hold</Caps>
          <Num label="USDC in this wallet" hint={seenText} value={values.usdcThis} onChange={set('usdcThis')} />
          <Num label="USDC or USDT in other wallets or exchanges" value={values.usdcElsewhere} onChange={set('usdcElsewhere')} />
          <Num label="Bank savings" value={values.bank} onChange={set('bank')} />
          <Num label="Cash" value={values.cash} onChange={set('cash')} />
          <Num label="Bitcoin (BTC), value today" value={values.btc} onChange={set('btc')} />
          <Num label="Ethereum (ETH), value today" value={values.eth} onChange={set('eth')} />
          <Num label="Other coins, value today" value={values.coins} onChange={set('coins')} />
          <Num label="Gold, value today" value={values.gold} onChange={set('gold')} />
          <Num label="Stocks or funds, value today" value={values.stocks} onChange={set('stocks')} />
        </>
      )}

      {has('other') && (
        <>
          <Caps>Other</Caps>
          <Ask label="Do you own a home, land, a car or a business, or have you lent money?" value={values.otherAssets} onChange={set('otherAssets')} />
          {values.otherAssets === 'yes' && (
            <>
              <Num label="Home or land, value" value={values.home} onChange={set('home')} />
              <Num label="Car, value" value={values.car} onChange={set('car')} />
              <Num label="Money you lent" value={values.lent} onChange={set('lent')} />
              <Num label="A business you own, value" value={values.business} onChange={set('business')} />
            </>
          )}
        </>
      )}

      {has('debt') && (
        <>
          <Caps>Debt</Caps>
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
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Btn variant="outline" onClick={onSkip}>Skip all</Btn>
        <Btn disabled={filled === 0} onClick={() => onReview(values)}>{filled === 0 ? 'Review' : `Review ${filled}`}</Btn>
      </div>
    </GlassCard>
  )
}
