// The first questions inside the chat (Hieu, 2026-10-28), as a short statement to fill in (Hieu, 2026-10-30, option C): each question
// is one ruled row, the label on the left and the answer on the right. Balance Sheet v2 (Hieu, 2026-10-31): two steps, each in two
// frames so a frame never needs scrolling. Step 1 is the cash flow that sizes the emergency fund (Your month, then Debt and big
// expenses); step 2 is what they hold (Safety and Traditional, then Crypto and the Traditional / Crypto split). Gold, Bitcoin, stocks and
// coins can be typed as $ or as a quantity. Home / car / business, passive income, airdrops, the goal's name and who a debt is owed to
// are left to the chat. A blank row is "prefer not to say"; the last frame saves straight away (sending is the user's confirmation).
// Pure props (no app context).

import { useState, type ReactNode } from 'react'
import { ArrowRight, Check, ChevronLeft } from 'lucide-react'
import { GlassCard } from '@/components/ui/kit'
import { formToItems, type FormValues, type SectionKey, type YesNo } from '@/lib/intakeForm'
import type { Prices } from '@/lib/allocation'

/** One ruled row: the question on the left, its answer on the right. */
function Row({ label, hint, under, children }: { label: string; hint?: string; under?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-14 py-2 flex items-center justify-between gap-4" style={{ borderBottom: '1px solid var(--line)' }}>
      <div className="min-w-0 flex flex-col gap-1">
        <span className="text-[16px] leading-6" style={{ color: 'var(--ink)' }}>{label}</span>
        {hint && <span className="text-[14px] leading-5" style={{ color: 'var(--muted)' }}>{hint}</span>}
        {under}
      </div>
      {children}
    </div>
  )
}

/** "4000" → "4,000" as it is typed (plain digits with an optional decimal part only; "2.5k" is left as typed). */
const group = (t: string) => {
  const m = /^([\d,]*)(\.\d*)?$/.exec(t)
  if (!m || !m[1]) return t
  return m[1].replace(/,/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (m[2] ?? '')
}

/** An amount typed on the right of its row: a dashed line while empty, plain figures (with thousands commas) once filled. */
function Amount({ label, hint, under, value, onChange, prefix = '$', suffix = '', plain = false }: { label: string; hint?: string; under?: ReactNode; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string; plain?: boolean }) {
  const empty = !value.trim()
  const unit = (t: string) => <span className="text-[16px] leading-6 font-semibold" style={{ color: empty ? 'var(--muted)' : 'var(--ink)' }}>{t}</span>
  return (
    <Row label={label} hint={hint} under={under}>
      {/* The symbol sits right against the figures: the input is as wide as what is typed, the whole answer is right-aligned. */}
      <label className="flex-shrink-0 min-w-[96px] max-w-[160px] h-10 flex items-center justify-end border-b border-dashed focus-within:border-solid focus-within:border-[var(--accent)] cursor-text"
        style={{ borderColor: empty ? 'var(--line)' : 'transparent' }}>
        {prefix && unit(prefix)}
        {/* Phones open the number pad: digits only for age, years and people; with a decimal point for money and rates. */}
        <input inputMode={plain ? 'numeric' : 'decimal'} pattern="[0-9.,]*" value={value} aria-label={label}
          onChange={e => onChange(group(e.target.value.replace(/[^0-9.,kKmM]/g, '').slice(0, 14)))}
          className="min-w-0 bg-transparent text-right text-[16px] leading-6 font-semibold tabular-nums outline-none" style={{ color: 'var(--ink)', width: `${Math.max(2, value.length) + 0.5}ch` }} />
        {suffix && unit(suffix)}
      </label>
    </Row>
  )
}

/** Small round choices; the chosen one is filled Blue. `small` = the unit switch under a label ($ / oz). */
function Pills<T extends string>({ value, options, onChange, label, small = false }: { value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; small?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={`flex-shrink-0 flex ${small ? 'gap-1' : 'gap-2'}`}>
      {options.map(o => {
        const on = value === o.value
        return (
          <button key={o.value} role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={`${small ? 'h-6 px-2' : 'h-8 px-4'} rounded-full text-[14px] leading-5 font-semibold transition-colors`}
            style={on ? { background: 'var(--accent)', color: 'white', border: '1px solid var(--accent)' } : { background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--line)' }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

const YES_NO = [{ value: 'yes' as const, label: 'Yes' }, { value: 'no' as const, label: 'No' }]

function YesNoRow({ label, value, onChange }: { label: string; value: YesNo; onChange: (v: 'yes' | 'no') => void }) {
  return <Row label={label}><Pills label={label} value={value} options={YES_NO} onChange={onChange} /></Row>
}

/** An amount typed in $ or as a quantity (Balance Sheet v2): the switch sits under the label, the unit follows the figures. */
function Priced<U extends string>({ label, value, onChange, unit, units, onUnit }: { label: string; value: string; onChange: (v: string) => void; unit: U; units: [U, U]; onUnit: (u: U) => void }) {
  const byQty = unit !== units[0]
  return (
    <Amount label={label} value={value} onChange={onChange} prefix={byQty ? '' : '$'} suffix={byQty ? ` ${unit === 'coins' ? '' : unit}`.trimEnd() : ''}
      under={<Pills small label={`${label} in`} value={unit} options={units.map(u => ({ value: u, label: u === 'usd' ? '$' : u === 'coins' ? 'Coins' : u === 'shares' ? 'Shares' : u }))} onChange={onUnit} />} />
  )
}

/** A ticker typed on the right (VOO, ETH): letters only, upper case. */
function Ticker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Row label={label}>
      <input value={value} aria-label={label} placeholder="VOO" autoCapitalize="characters" spellCheck={false}
        onChange={e => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, 10))}
        className="w-24 h-10 bg-transparent text-right text-[16px] leading-6 font-semibold outline-none border-b border-dashed focus:border-solid focus:border-[var(--accent)]"
        style={{ color: 'var(--ink)', borderColor: value ? 'transparent' : 'var(--line)' }} />
    </Row>
  )
}

/** A small heading inside a frame ("Safety", "Traditional"). */
const Group = ({ children }: { children: ReactNode }) => <p className="pt-2 text-[14px] leading-5 font-semibold" style={{ color: 'var(--subtle)' }}>{children}</p>

interface Step { key: string; title: string; note?: string; view: ReactNode }

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
  const scope = values.planningScope ?? planningScope ?? 'individual'
  const household = scope === 'household'

  if (status) {
    return (
      <GlassCard className="ml-10 px-4 py-3 flex items-center gap-2">
        <Check size={20} style={{ color: 'var(--accent)' }} />
        <p className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>{saved ? `Saved ${saved} ${saved === 1 ? 'detail' : 'details'}` : 'Details sent'}</p>
      </GlassCard>
    )
  }

  const has = (k: SectionKey) => keys.includes(k)
  const set = <K extends keyof FormValues>(k: K) => (v: FormValues[K]) => onChange({ ...values, [k]: v })
  const seenText = seen !== null && seen >= 1 ? `I can see ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.floor(seen))} USDC in this wallet` : undefined

  const steps: Step[] = []
  // Who the plan is for is asked once, at the top of the first step.
  steps.push({ key: 'month', title: 'Your month', note: household ? 'Shared totals count once. The split uses your age.' : undefined, view: <>
    <div className="pb-2"><Pills label="Plan for" value={scope} options={[{ value: 'individual' as const, label: 'Just me' }, { value: 'household' as const, label: 'Household' }]} onChange={set('planningScope')} /></div>
    {has('age') && <Amount label={household ? 'Your age (for this plan)' : 'Age'} value={values.age} onChange={set('age')} prefix="" plain />}
    {has('income') && <Amount label={household ? 'Combined salary a month' : 'Salary a month'} value={values.salary} onChange={set('salary')} />}
    {/* Debt payments are asked with the debt and added to spending for the emergency fund (KB fund_floor), so they are left out here. */}
    {has('spending') && <Amount label={household ? 'Household spending a month' : 'Spending a month'} hint="Not counting debt payments" value={values.spending} onChange={set('spending')} />}
    {has('stability') && <>
      <YesNoRow label={household ? 'Combined income steady?' : 'Income steady?'} value={values.steady} onChange={set('steady')} />
      <YesNoRow label={household ? 'Anyone depends on it?' : 'Anyone relies on it?'} value={values.reliers} onChange={set('reliers')} />
      {values.reliers === 'yes' && <Amount label="How many people?" value={values.reliersCount} onChange={set('reliersCount')} prefix="" plain />}
      {household && <YesNoRow label="Only one person earning?" value={values.onlyEarner ?? null} onChange={set('onlyEarner')} />}
    </>}
  </> })
  // Step 1, second frame: the rest of the cash flow the emergency fund is sized from.
  if (has('goal') || has('debt')) steps.push({ key: 'debt', title: 'Debt and big expenses', view: <>
    {has('debt') && <YesNoRow label="Any debt, family loans included?" value={values.debt} onChange={set('debt')} />}
    {has('debt') && values.debt === 'yes' && <>
      <Amount label="Total you still owe" value={values.debtOwed} onChange={set('debtOwed')} />
      <Amount label="Interest a year" value={values.debtRate} onChange={set('debtRate')} prefix="" suffix="%" />
      <Amount label="You pay a month" value={values.debtMonthly} onChange={set('debtMonthly')} />
    </>}
    {has('goal') && <YesNoRow label="A big expense within 5 years?" value={values.goal} onChange={set('goal')} />}
    {has('goal') && values.goal === 'yes' && <>
      <Amount label="How much?" hint="A car, a wedding, school" value={values.goalAmount} onChange={set('goalAmount')} />
      <Amount label="In how many years?" value={values.goalYears} onChange={set('goalYears')} prefix="" plain />
    </>}
  </> })
  // Step 2: what they hold, by part (Hieu approved the list 2026-10-31). The emergency fund vault and cirBTC are read onchain.
  if (has('assets')) {
    steps.push({ key: 'hold', title: 'What you hold', note: 'Blank is fine. Your emergency fund is counted on its own.', view: <>
      <Group>Safety</Group>
      <Amount label="Bank savings and cash" value={values.bank} onChange={set('bank')} />
      <Amount label="Stablecoins" hint={seenText ?? 'USDC, USDT'} value={values.usdcThis} onChange={set('usdcThis')} />
      <Amount label="Bonds, T-bills, money market" value={values.bonds ?? ''} onChange={set('bonds')} />
      <Group>Traditional</Group>
      <Priced label="Gold" value={values.gold} onChange={set('gold')} unit={values.goldUnit ?? 'usd'} units={['usd', 'oz']} onUnit={set('goldUnit')} />
      <Priced label="US stocks and ETFs" value={values.stocks} onChange={set('stocks')} unit={values.stocksUnit ?? 'usd'} units={['usd', 'shares']} onUnit={set('stocksUnit')} />
      {values.stocksUnit === 'shares' && <Ticker label="Ticker" value={values.stocksTicker ?? ''} onChange={set('stocksTicker')} />}
      <Amount label="Vietnamese stocks" value={values.vnStocks ?? ''} onChange={set('vnStocks')} />
      <Amount label="High-yield bonds" value={values.junkBonds ?? ''} onChange={set('junkBonds')} />
    </> })
    steps.push({ key: 'crypto', title: 'Crypto and your split', view: <>
      <Priced label="Bitcoin" value={values.btc} onChange={set('btc')} unit={values.btcUnit === 'coins' ? 'BTC' : 'usd'} units={['usd', 'BTC']} onUnit={u => set('btcUnit')(u === 'BTC' ? 'coins' : 'usd')} />
      <Priced label="Other coins" value={values.coins} onChange={set('coins')} unit={values.coinsUnit ?? 'usd'} units={['usd', 'coins']} onUnit={set('coinsUnit')} />
      {values.coinsUnit === 'coins' && <Ticker label="Which coin" value={values.coinsTicker ?? ''} onChange={set('coinsTicker')} />}
      <div className="py-2 flex flex-col gap-2">
        <span className="text-[16px] leading-6" style={{ color: 'var(--ink)' }}>Outside Safety, Traditional / Crypto</span>
        <Pills label="Traditional / Crypto split" value={values.cryptoSplit ?? null} options={[{ value: '30', label: '70 / 30' }, { value: '50', label: '50 / 50' }, { value: '70', label: '30 / 70' }]} onChange={set('cryptoSplit')} />
        <span className="text-[14px] leading-5" style={{ color: 'var(--muted)' }}>50 / 50 is MoonSafe's default, not a fixed rule. Your call.</span>
      </div>
    </> })
  }

  const i = Math.min(at, steps.length - 1)
  const cur = steps[i]
  const last = i === steps.length - 1
  // The scope counts as an answer only once chosen (the pills show "Just me" by default without saving it).
  const full = { ...values, planningScope: values.planningScope ?? planningScope }
  const count = formToItems(full, prices).length
  const next = () => { if (!last) setAt(i + 1); else if (count) onReview(full); else onSkip() }

  return (
    <GlassCard className="ml-10 p-4 flex flex-col gap-2 w-[calc(100%-40px)] max-w-[480px] sm:max-w-[560px]">
      {steps.length > 1 && (
        <div className="flex gap-1 pb-2" aria-label={`Step ${i + 1} of ${steps.length}`}>
          {steps.map((s, k) => <span key={s.key} className="flex-1 h-1 rounded-full" style={{ background: k <= i ? 'var(--accent)' : 'var(--line)' }} />)}
        </div>
      )}
      <h3 className="display text-[20px] leading-7 font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>{cur.title}</h3>
      {cur.note && <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>{cur.note}</p>}
      <div key={cur.key} className="flex flex-col [&>*:last-child]:border-b-0">{cur.view}</div>

      <div className="pt-2 flex items-center justify-between">
        {i > 0
          ? <button onClick={() => setAt(i - 1)} className="h-10 -ml-1 flex items-center gap-1 text-[16px] leading-6 font-semibold" style={{ color: 'var(--subtle)' }}><ChevronLeft size={20} />Back</button>
          : <button onClick={onSkip} className="h-10 text-[16px] leading-6 font-semibold" style={{ color: 'var(--subtle)' }}>Skip all</button>}
        <button onClick={next} className="h-12 px-6 rounded-2xl flex items-center gap-2 text-[16px] leading-6 font-semibold transition-transform active:scale-[0.98]"
          style={{ background: 'var(--accent)', color: 'white' }}>
          {last ? (count ? `Save ${count}` : 'Done') : 'Next'}
          {!last && <ArrowRight size={20} />}
        </button>
      </div>
    </GlassCard>
  )
}
