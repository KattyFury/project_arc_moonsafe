// Shortcuts above the message box (Hieu, 2026-11-03; three buttons since 2026-11-06): Update split, Edit cash flow, Edit information.
// Nothing here calls the model; every change goes through one Confirm step and is saved with the same operations as the agent's cards
// (src/lib/shortcuts.ts). Totals are worked out by the app and cannot be typed in.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, ChevronRight, Plus, Users, Wallet, Waves, X, type LucideIcon } from 'lucide-react'
import { useApp } from '@/state/AppState'
import { holdingUsd } from '@/lib/allocation'
import { parseAmount } from '@/lib/intakeForm'
import { CIRBTC_DECIMALS } from '@/hooks/useCirBtc'
import type { ProfileFields, ProfileOp } from '@/lib/profile'
import {
  ASSET_CHOICES, INFO_LABEL, PART_LABEL, SPLIT_CHOICES, addDebtOp, addHoldingOp, addLineOp, cleanSymbol, editDebtOp, editHoldingOp, editLineOp,
  editableHoldings, editsQuantity, infoOp, lineAmount, monthLines, partOf, removeHoldingOp, removeLineOp, shortcutsFor, splitOp,
  type AssetChoice, type DebtFields, type InfoKey, type MonthLine, type Part, type ShortcutId,
} from '@/lib/shortcuts'
import type { Debt, Holding } from '@/types'
import { Btn } from '@/components/ui/kit'

const ICONS: Record<ShortcutId, LucideIcon> = { split: Wallet, flow: Waves, info: Users }
const PARTS = ['safe', 'traditional', 'crypto'] as const

type Step =
  | { s: 'split' }
  | { s: 'item'; holding: Holding }
  | { s: 'choose'; part: Part }
  | { s: 'new'; choice: AssetChoice; part: Part }
  | { s: 'ratio' }
  | { s: 'flow' }
  | { s: 'line'; line: MonthLine }
  | { s: 'newLine'; kind: 'income' | 'expense' }
  | { s: 'debt'; debt: Debt | null }
  | { s: 'info' }
  | { s: 'infoEdit'; key: InfoKey }
  | { s: 'confirm'; text: string; ops: ProfileOp[]; note: string; back: Step }

export function ShortcutBar({ disabled, onSaved }: {
  disabled: boolean
  /** The change is saved: one line in the chat says what changed. */
  onSaved: (note: string) => void
}) {
  const { profile, balance, prices, fx, cirBtc, moneyUsd } = useApp()
  const [step, setStep] = useState<Step | null>(null)
  const [open, setOpen] = useState<ShortcutId | null>(null)
  const [amount, setAmount] = useState('')
  const [name, setName] = useState('')
  const [rate, setRate] = useState('')
  const [monthly, setMonthly] = useState('')
  const [picked, setPicked] = useState<number | null>(null)
  const [yes, setYes] = useState<boolean | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => { panel.current?.scrollTo({ top: 0 }) }, [step])

  if (!profile.known) return null
  const p = profile.profile
  const n = parseAmount(amount)
  const valid = n !== null && n > 0 && n < 1e15
  const go = (next: Step, typed = '') => { setAmount(typed); setName(''); setStep(next) }
  const close = () => { setStep(null); setOpen(null); setAmount(''); setName(''); setRate(''); setMonthly(''); setPicked(null); setYes(null) }
  const tap = (id: ShortcutId) => {
    if (open === id) { close(); return }
    setOpen(id)
    go(id === 'split' ? { s: 'split' } : id === 'flow' ? { s: 'flow' } : { s: 'info' })
  }
  const confirm = (text: string, ops: ProfileOp[], note: string, back: Step) => setStep({ s: 'confirm', text, ops, note, back })
  const usdOf = (h: Holding) => holdingUsd(h, prices.prices, fx.vndPerUsd)
  const shown = (h: Holding) => { const u = usdOf(h); return u === null ? 'no price yet' : moneyUsd(u) }
  const native = (v: number, currency: string) => currency === 'VND' ? `${v.toLocaleString('en-US')} VND` : moneyUsd(v)
  const count = (q: number) => q.toLocaleString('en-US', { maximumFractionDigits: q >= 100 ? 2 : 8 })
  const qtyText = (h: Holding) => editsQuantity(h) ? `${count(h.quantity!)}${h.unit && h.unit !== 'coins' ? ` ${h.unit}` : ''}` : ''
  // The app's own totals (the same figures as the agent's): every item in the part, cirBTC read from the wallet included.
  const total = (part: Part) => balance.items.filter(i => i.group && (part === 'safe' ? i.group === 'safe' : part === 'traditional' ? i.group === 'traditional' : ['btc', 'large_cap', 'altcoin'].includes(i.group))).reduce((s, i) => s + i.usd, 0)
  const cirQty = cirBtc.balance !== null && cirBtc.balance > 0n ? Number(cirBtc.balance) / 10 ** CIRBTC_DECIMALS : 0
  const cirUsd = cirBtc.valueUsdc6 !== null ? Number(cirBtc.valueUsdc6) / 1_000_000 : null

  let body: ReactNode = null
  if (step?.s === 'split') {
    const list = editableHoldings(p, 'all')
    const others = list.filter(h => partOf(h) === null)
    const c = p?.cryptoSplit ?? 50
    const row = (h: Holding) => <Row key={h.id} label={h.name} qty={qtyText(h)} value={shown(h)} onClick={() => go({ s: 'item', holding: h }, String(editsQuantity(h) ? h.quantity : h.value ?? ''))} />
    body = <Panel title="Your split" hint="Each total is worked out by the app from what you list here." onClose={close}>
      {PARTS.map(part => {
        const items = list.filter(h => partOf(h) === part)
        return (
          <div key={part} className="flex flex-col">
            <div className="pt-2 pb-1 flex items-baseline justify-between gap-4" style={{ borderBottom: '1px solid var(--line)' }}>
              <span className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>{PART_LABEL[part]}</span>
              <span className="text-[16px] leading-6 font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{moneyUsd(total(part))}</span>
            </div>
            {part !== 'safe' && (items.length > 0 || (part === 'crypto' && cirQty > 0)) && <Cols />}
            {items.map(row)}
            {part === 'crypto' && cirQty > 0 && <Row label="cirBTC" sub="Read from your wallet" qty={count(cirQty)} value={cirUsd !== null ? moneyUsd(cirUsd) : 'no price yet'} />}
            <Add label={`Add to ${PART_LABEL[part]}`} onClick={() => go({ s: 'choose', part })} />
          </div>
        )
      })}
      {others.length > 0 && <div className="flex flex-col"><Group>Other</Group>{others.map(row)}</div>}
      <Line label="Traditional / Crypto" sub="How the money outside Safety is split" value={`${100 - c} / ${c}`} onClick={() => { setPicked(c); setStep({ s: 'ratio' }) }} />
    </Panel>
  } else if (step?.s === 'item') {
    const h = step.holding
    const back: Step = { s: 'split' }
    const qty = editsQuantity(h)
    const unit = h.unit && h.unit !== 'coins' ? h.unit : ''
    const was = qty ? `${count(h.quantity!)} ${unit}`.trim() : native(h.value ?? 0, h.currency ?? 'USDC')
    const now = !valid ? '' : qty ? `${count(n!)} ${unit}`.trim() : native(n!, h.currency ?? 'USDC')
    body = <Panel title={h.name} hint={qty ? 'The value follows today\'s price.' : 'What it is worth now, not what you paid.'} onBack={() => setStep(back)} onClose={close}>
      <Amount value={amount} onChange={setAmount} label={qty ? `How many ${h.unit === 'oz' ? 'ounces' : h.unit === 'shares' ? 'shares' : 'coins'}` : h.currency === 'VND' ? 'Worth now, in VND' : 'Worth now, in USD'} />
      <Btn size="sm" disabled={!valid} onClick={() => confirm(`${h.name}: ${was} → ${now}`, [editHoldingOp(h, n!)], `Saved: ${h.name} is now ${now}.`, step)}>Save</Btn>
      <Btn size="sm" variant="outline" onClick={() => confirm(`Remove ${h.name} (${was})`, [removeHoldingOp(h)], `Removed: ${h.name}.`, step)}>Remove</Btn>
    </Panel>
  } else if (step?.s === 'choose') {
    const part = step.part
    body = <Panel title={`Add to ${PART_LABEL[part]}`} hint={part === 'safe' ? 'Safety is only for low-volatility money, so it steadies your whole picture.' : undefined} onBack={() => setStep({ s: 'split' })} onClose={close}>
      {ASSET_CHOICES[part].map(c => <Line key={c.type + c.name} label={c.label} onClick={() => go({ s: 'new', choice: c, part })} />)}
    </Panel>
  } else if (step?.s === 'new') {
    const c = step.choice
    const byQty = c.by === 'qty'
    const ticker = byQty && c.asksName
    const typed = ticker ? cleanSymbol(name) : name.trim()
    const label = typed || c.name
    const unitWord = c.unit === 'oz' ? 'ounces' : c.unit === 'shares' ? 'shares' : 'coins'
    const what = byQty ? `${count(n ?? 0)} ${c.unit === 'coins' ? '' : c.unit}`.replace(/\s+$/, '') : moneyUsd(n ?? 0)
    body = <Panel title={c.label} hint={c.hint ?? (byQty ? 'The app values it at today\'s price.' : undefined)} onBack={() => setStep({ s: 'choose', part: step.part })} onClose={close}>
      {c.asksName && <Text value={name} onChange={setName} label={ticker ? (c.unit === 'shares' ? 'Ticker' : 'Symbol') : 'Which one'} />}
      <Amount value={amount} onChange={setAmount} label={byQty ? `How many ${unitWord}` : 'Worth now, in USD'} />
      <Btn size="sm" disabled={!valid || (c.asksName && !typed)} onClick={() => confirm(`Add ${label}: ${what} in ${PART_LABEL[step.part]}`, [addHoldingOp(c, n!, name)], `Saved: ${label}, ${what} in ${PART_LABEL[step.part]}.`, step)}>Save</Btn>
    </Panel>
  } else if (step?.s === 'ratio') {
    const was = p?.cryptoSplit ?? 50
    const c = picked ?? was
    body = <Panel title="Traditional / Crypto" hint="50 / 50 is MoonSafe's default. You can lean to Traditional; Crypto stays at 50% or less because it swings so much." onBack={() => setStep({ s: 'split' })} onClose={close}>
      <Choices options={SPLIT_CHOICES.map(v => ({ key: String(v), label: `${100 - v} / ${v}` }))} value={String(c)} onPick={v => setPicked(Number(v))} label="Traditional / Crypto split" />
      <Btn size="sm" disabled={c === was} onClick={() => confirm(`Traditional ${100 - c}% / Crypto ${c}%`, [splitOp(c)], `Saved: outside Safety your split is now Traditional ${100 - c}% / Crypto ${c}%.`, step)}>Save</Btn>
    </Panel>
  } else if (step?.s === 'flow') {
    const lines = monthLines(p)
    const debtSub = (d: Debt) => [d.ratePct !== null ? `${d.ratePct}% a year` : 'rate not told', d.monthlyPayment !== null ? `${native(d.monthlyPayment, d.currency)} a month` : null].filter(Boolean).join(' · ')
    const of = (kind: MonthLine['kind']) => lines.filter(l => l.kind === kind)
    const openLine = (l: MonthLine) => {
      if (l.kind === 'debt') { setAmount(String(l.item.balance)); setRate(l.item.ratePct !== null ? String(l.item.ratePct) : ''); setMonthly(l.item.monthlyPayment !== null ? String(l.item.monthlyPayment) : ''); setName(''); setStep({ s: 'debt', debt: l.item }) }
      else go({ s: 'line', line: l }, String(lineAmount(l)))
    }
    const group = (title: string, kind: MonthLine['kind'], add: ReactNode) => (
      <div className="flex flex-col">
        <Group>{title}</Group>
        {of(kind).map(l => <Line key={l.item.id} label={l.item.name} sub={l.kind === 'debt' ? debtSub(l.item) : undefined} value={l.kind === 'debt' ? native(l.item.balance, l.item.currency) : `${native(lineAmount(l), l.item.currency)}`} onClick={() => openLine(l)} />)}
        {add}
      </div>
    )
    body = <Panel title="Your cash flow" hint="A month of income and spending, and what you owe. Your emergency fund target follows these numbers." onClose={close}>
      {group('Income a month', 'income', <Add label="Add income" onClick={() => go({ s: 'newLine', kind: 'income' })} />)}
      {group('Spending a month', 'expense', <Add label="Add spending" onClick={() => go({ s: 'newLine', kind: 'expense' })} />)}
      {group('Debts, still owed', 'debt', <Add label="Add a debt" onClick={() => { setRate(''); setMonthly(''); go({ s: 'debt', debt: null }) }} />)}
    </Panel>
  } else if (step?.s === 'line') {
    const l = step.line
    const c = l.item.currency
    body = <Panel title={l.item.name} onBack={() => setStep({ s: 'flow' })} onClose={close}>
      <Amount value={amount} onChange={setAmount} label={`A month, in ${c === 'VND' ? 'VND' : 'USD'}`} />
      <Btn size="sm" disabled={!valid} onClick={() => confirm(`${l.item.name}: ${native(lineAmount(l), c)} → ${native(n!, c)} a month`, [editLineOp(l, n!)], `Saved: ${l.item.name} is now ${native(n!, c)} a month.`, step)}>Save</Btn>
      <Btn size="sm" variant="outline" onClick={() => confirm(`Remove ${l.item.name}`, [removeLineOp(l)], `Removed: ${l.item.name}.`, step)}>Remove</Btn>
    </Panel>
  } else if (step?.s === 'newLine') {
    const word = step.kind === 'income' ? 'income' : 'spending'
    body = <Panel title={`Add ${word}`} onBack={() => setStep({ s: 'flow' })} onClose={close}>
      <Text value={name} onChange={setName} label="What is it" />
      <Amount value={amount} onChange={setAmount} label="A month, in USD" />
      <Btn size="sm" disabled={!valid} onClick={() => confirm(`Add ${name.trim() || word}: ${moneyUsd(n!)} a month`, [addLineOp(step.kind, name, n!)], `Saved: ${name.trim() || word}, ${moneyUsd(n!)} a month.`, step)}>Save</Btn>
    </Panel>
  } else if (step?.s === 'debt') {
    const d = step.debt
    const r = rate.trim() === '' ? null : parseAmount(rate)
    const m = monthly.trim() === '' ? null : parseAmount(monthly)
    const ok = valid && (rate.trim() === '' || (r !== null && r >= 0 && r < 1000)) && (monthly.trim() === '' || (m !== null && m >= 0))
    const f: DebtFields = { balance: n ?? 0, ratePct: r, monthlyPayment: m }
    const c = d?.currency ?? 'USDC'
    const text = `${d ? d.name : name.trim() || 'Debt'}: ${native(f.balance, c)} owed${f.ratePct !== null ? `, ${f.ratePct}% a year` : ''}${f.monthlyPayment !== null ? `, ${native(f.monthlyPayment, c)} a month` : ''}`
    body = <Panel title={d ? d.name : 'Add a debt'} hint="Debt at 10% a year or more is paid off before investing." onBack={() => setStep({ s: 'flow' })} onClose={close}>
      {!d && <Text value={name} onChange={setName} label="What is it" />}
      <Amount value={amount} onChange={setAmount} label={`Still owed, in ${c === 'VND' ? 'VND' : 'USD'}`} />
      <Amount value={rate} onChange={setRate} label="Interest, % a year" />
      <Amount value={monthly} onChange={setMonthly} label={`Paid a month, in ${c === 'VND' ? 'VND' : 'USD'}`} />
      <Btn size="sm" disabled={!ok} onClick={() => confirm(text, [d ? editDebtOp(d, f) : addDebtOp(name, f)], `Saved: ${text}.`, step)}>Save</Btn>
      {d && <Btn size="sm" variant="outline" onClick={() => confirm(`${d.name} is paid off`, [removeLineOp({ kind: 'debt', item: d })], `Saved: ${d.name} is paid off.`, step)}>Paid off</Btn>}
    </Panel>
  } else if (step?.s === 'info') {
    const yn = (v: boolean | null | undefined) => v === true ? 'Yes' : v === false ? 'No' : 'Not told'
    const val: Record<InfoKey, string> = {
      age: p?.age !== null && p?.age !== undefined ? String(p.age) : 'Not told',
      dependents: p?.dependents !== null && p?.dependents !== undefined ? String(p.dependents) : 'Not told',
      incomeStable: yn(p?.incomeStable),
      soleEarner: yn(p?.soleEarner),
    }
    const edit = (key: InfoKey) => {
      const cur = p?.[key]
      setYes(typeof cur === 'boolean' ? cur : null)
      go({ s: 'infoEdit', key }, typeof cur === 'number' ? String(cur) : '')
    }
    body = <Panel title="Your information" hint="Your age sets the shares of the three parts; the people who rely on you and how steady your income is set how many months your emergency fund holds." onClose={close}>
      {(['age', 'dependents', 'incomeStable', 'soleEarner'] as const).map(k => <Line key={k} label={INFO_LABEL[k]} value={val[k]} onClick={() => edit(k)} />)}
    </Panel>
  } else if (step?.s === 'infoEdit') {
    const key = step.key
    const isNum = key === 'age' || key === 'dependents'
    const whole = n !== null && Number.isInteger(n)
    const ok = isNum ? (key === 'age' ? whole && n! >= 16 && n! <= 100 : whole && n! >= 0 && n! <= 20) || (key === 'dependents' && amount.trim() === '0') : yes !== null
    const v = key === 'dependents' && amount.trim() === '0' ? 0 : n
    const fields: ProfileFields = key === 'age' ? { age: v, ageDeclined: false } : key === 'dependents' ? { dependents: v } : key === 'incomeStable' ? { incomeStable: yes } : { soleEarner: yes }
    const shownVal = isNum ? String(v) : yes ? 'Yes' : 'No'
    body = <Panel title={INFO_LABEL[key]} hint={key === 'dependents' ? 'A partner, children or parents who live on your income.' : key === 'soleEarner' ? 'Nobody else at home brings in money.' : undefined} onBack={() => setStep({ s: 'info' })} onClose={close}>
      {isNum
        ? <Amount value={amount} onChange={setAmount} label={key === 'age' ? 'Your age' : 'How many people'} />
        : <Choices options={[{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }]} value={yes === null ? '' : yes ? 'yes' : 'no'} onPick={k => setYes(k === 'yes')} label={INFO_LABEL[key]} />}
      <Btn size="sm" disabled={!ok} onClick={() => confirm(`${INFO_LABEL[key]}: ${shownVal}`, [infoOp(fields)], `Saved: ${INFO_LABEL[key].toLowerCase()}, ${shownVal}.`, step)}>Save</Btn>
    </Panel>
  } else if (step?.s === 'confirm') {
    const { text, ops, note, back } = step
    body = <Panel title="Save this?" onBack={() => setStep(back)} onClose={close}>
      <p className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>{text}</p>
      <Btn size="sm" onClick={() => { profile.apply(ops); onSaved(note); close() }}><Check size={16} />Confirm</Btn>
    </Panel>
  }

  return (
    <div className="flex-shrink-0 flex flex-col gap-2 px-4 pt-2 lg:px-6" style={{ background: 'var(--chat-bg)' }}>
      {body && <div ref={panel} className="rounded-2xl p-4 overflow-y-auto no-scrollbar" style={{ background: 'var(--bg)', boxShadow: 'var(--shadow-y2)', maxHeight: 'min(480px, 60dvh)' }}>{body}</div>}
      <div className="flex flex-wrap gap-2">
        {shortcutsFor().map(({ id, label }) => {
          const Icon = ICONS[id]
          const on = open === id
          return (
            <button key={id} onClick={() => tap(id)} disabled={disabled} aria-pressed={on}
              className="h-10 px-4 rounded-full flex items-center gap-2 text-[14px] leading-5 font-semibold whitespace-nowrap transition-transform active:scale-[0.97] disabled:cursor-not-allowed"
              style={on ? { background: 'var(--accent)', color: 'white', border: '1px solid var(--accent)' } : { background: 'var(--bg)', color: disabled ? 'var(--muted)' : 'var(--ink)', border: '1px solid var(--line)' }}>
              <Icon size={16} className="hidden lg:block" style={{ color: on ? 'white' : disabled ? 'var(--muted)' : 'var(--accent)' }} />{label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Panel({ title, hint, onBack, onClose, children }: { title: string; hint?: string; onBack?: () => void; onClose: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 min-h-8">
        {onBack && <button onClick={onBack} aria-label="Back" className="w-8 h-8 flex-shrink-0 flex items-center justify-center" style={{ color: 'var(--subtle)' }}><ArrowLeft size={20} /></button>}
        <p className="flex-1 min-w-0 text-[16px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>{title}</p>
        <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex-shrink-0 flex items-center justify-center" style={{ color: 'var(--subtle)' }}><X size={20} /></button>
      </div>
      {hint && <Hint>{hint}</Hint>}
      {children}
    </div>
  )
}

const Group = ({ children }: { children: ReactNode }) => <p className="pt-2 text-[14px] leading-5 font-semibold" style={{ color: 'var(--subtle)' }}>{children}</p>

const Hint = ({ children }: { children: ReactNode }) => <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>{children}</p>

// Three columns for Traditional and Crypto (Hieu, 2026-11-06): what it is, how many, what it is worth today.
const GRID = 'grid grid-cols-[minmax(0,1fr)_auto_96px_16px] items-center gap-2'
const Cols = () => (
  <div className={`${GRID} pt-2 text-[14px] leading-5`} style={{ color: 'var(--subtle)' }}>
    <span>Item</span><span className="text-right">Amount</span><span className="text-right">Value</span><span />
  </div>
)

function Row({ label, sub, qty, value, onClick }: { label: string; sub?: string; qty: string; value: string; onClick?: () => void }) {
  const inner = <>
    <span className="min-w-0">
      <span className="block text-[16px] leading-6 truncate" style={{ color: 'var(--ink)' }}>{label}</span>
      {sub && <span className="block text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>{sub}</span>}
    </span>
    <span className="text-right text-[14px] leading-5 tabular-nums" style={{ color: 'var(--subtle)' }}>{qty}</span>
    <span className="text-right text-[16px] leading-6 tabular-nums" style={{ color: 'var(--ink)' }}>{value}</span>
    {onClick ? <ChevronRight size={16} style={{ color: 'var(--muted)' }} /> : <span />}
  </>
  return onClick
    ? <button onClick={onClick} className={`${GRID} w-full min-h-12 py-2 text-left`} style={{ borderBottom: '1px solid var(--line)' }}>{inner}</button>
    : <div className={`${GRID} w-full min-h-12 py-2`} style={{ borderBottom: '1px solid var(--line)' }}>{inner}</div>
}

function Add({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full min-h-12 py-2 flex items-center gap-2 text-left" style={{ borderBottom: '1px solid var(--line)' }}>
      <Plus size={16} className="flex-shrink-0" style={{ color: 'var(--accent)' }} />
      <span className="text-[16px] leading-6" style={{ color: 'var(--accent)' }}>{label}</span>
    </button>
  )
}

function Line({ label, sub, value, onClick }: { label: string; sub?: string; value?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full min-h-12 py-2 flex items-center gap-2 text-left" style={{ borderBottom: '1px solid var(--line)' }}>
      <span className="flex-1 min-w-0">
        <span className="block text-[16px] leading-6 truncate" style={{ color: 'var(--ink)' }}>{label}</span>
        {sub && <span className="block text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>{sub}</span>}
      </span>
      {value && <span className="flex-shrink-0 text-[16px] leading-6 tabular-nums" style={{ color: 'var(--ink)' }}>{value}</span>}
      <ChevronRight size={16} className="flex-shrink-0" style={{ color: 'var(--muted)' }} />
    </button>
  )
}

function Choices({ options, value, onPick, label }: { options: { key: string; label: string }[]; value: string; onPick: (key: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(o => {
        const on = value === o.key
        return <button key={o.key} role="radio" aria-checked={on} onClick={() => onPick(o.key)} className="h-10 px-4 rounded-full text-[14px] leading-5 font-semibold"
          style={on ? { background: 'var(--accent)', color: 'white', border: '1px solid var(--accent)' } : { background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--line)' }}>{o.label}</button>
      })}
    </div>
  )
}

const FIELD = 'h-12 w-full px-4 rounded-2xl border border-[var(--line)] focus:border-2 focus:border-[var(--accent)] bg-[var(--surface-muted)] text-[16px] leading-6 outline-none placeholder:text-[var(--muted)]'

function Amount({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[14px] leading-5 font-semibold" style={{ color: 'var(--subtle)' }}>{label}</span>
      <input inputMode="decimal" value={value} placeholder="0" onChange={e => onChange(e.target.value)} className={`${FIELD} tabular-nums`} style={{ color: 'var(--ink)' }} />
    </label>
  )
}

function Text({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[14px] leading-5 font-semibold" style={{ color: 'var(--subtle)' }}>{label}</span>
      <input value={value} maxLength={60} onChange={e => onChange(e.target.value)} className={FIELD} style={{ color: 'var(--ink)' }} />
    </label>
  )
}
