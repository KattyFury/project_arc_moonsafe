// Shortcuts above the message box (Hieu, 2026-11-03): add to or edit the portfolio by tapping. Nothing here calls the model; every
// change goes through one Confirm step and is saved with the same operations as the agent's cards (src/lib/shortcuts.ts).

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, CalendarDays, Check, ChevronRight, Plus, Shield, Wallet, X, type LucideIcon } from 'lucide-react'
import { useApp } from '@/state/AppState'
import { holdingUsd } from '@/lib/allocation'
import { parseAmount } from '@/lib/intakeForm'
import type { ProfileOp } from '@/lib/profile'
import {
  ASSET_CHOICES, PART_LABEL, SPLIT_CHOICES, addHoldingOp, btcPart, addLineOp, editHoldingOp, editLineOp, editableHoldings, editsQuantity, lineAmount,
  monthLines, partOf, removeHoldingOp, removeLineOp, shortcutsFor, splitAmount, splitOp, type AssetChoice, type MonthLine, type Part, type ShortcutId,
} from '@/lib/shortcuts'
import type { Holding } from '@/types'
import { Btn } from '@/components/ui/kit'

const ICONS: Record<ShortcutId, LucideIcon> = { fund: Shield, add: Plus, hold: Wallet, month: CalendarDays }

type Step =
  | { s: 'fund' }
  | { s: 'list' }
  | { s: 'item'; holding: Holding }
  | { s: 'choose'; part: Part | 'all'; amount?: number }
  | { s: 'new'; choice: AssetChoice; amount?: number }
  | { s: 'month' }
  | { s: 'line'; line: MonthLine }
  | { s: 'newLine'; kind: 'income' | 'expense' }
  | { s: 'split' }
  | { s: 'add' }
  | { s: 'parts'; amount: number }
  | { s: 'crypto'; amount: number }
  | { s: 'confirm'; text: string; ops: ProfileOp[]; note: string; back: Step }

export function ShortcutBar({ disabled, onSaved, onCard }: {
  disabled: boolean
  /** The change is saved: one line in the chat says what changed. */
  onSaved: (note: string) => void
  /** Show the deposit or cirBTC card in the chat, the same card the agent prepares. */
  onCard: (kind: 'deposit' | 'buy', amountUsd: number) => void
}) {
  const { profile, vault, math, balance, prices, fx, moneyUsd } = useApp()
  const [step, setStep] = useState<Step | null>(null)
  const [open, setOpen] = useState<ShortcutId | null>(null)
  const [amount, setAmount] = useState('')
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<number | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => { panel.current?.scrollTo({ top: 0 }) }, [step])

  if (!profile.known) return null
  const chips = shortcutsFor({ unlocked: math.investUnlocked, hasVault: !!vault.vaultAddress })
  const p = profile.profile
  const n = parseAmount(amount)
  const valid = n !== null && n > 0 && n < 1e15
  const go = (next: Step, typed = '') => { setAmount(typed); setName(''); setStep(next) }
  const close = () => { setStep(null); setOpen(null); setAmount(''); setName(''); setPicked(null) }
  const tap = (id: ShortcutId) => {
    if (open === id) { close(); return }
    setOpen(id); setPicked(p?.cryptoSplit ?? 50)
    go(id === 'fund' ? { s: 'fund' } : id === 'month' ? { s: 'month' } : id === 'hold' ? { s: 'list' } : { s: 'add' })
  }
  const confirm = (text: string, ops: ProfileOp[], note: string, back: Step) => setStep({ s: 'confirm', text, ops, note, back })
  const usdOf = (h: Holding) => holdingUsd(h, prices.prices, fx.vndPerUsd)
  const shown = (h: Holding) => { const u = usdOf(h); return u === null ? 'no price yet' : moneyUsd(u) }
  const native = (v: number, currency: string) => currency === 'VND' ? `${v.toLocaleString('en-US')} VND` : moneyUsd(v)
  const target = balance.target
  const shares = target ? { safe: target.safe, traditional: target.traditional, crypto: target.btc + target.large_cap + target.altcoin } : null

  let body: ReactNode = null
  if (step?.s === 'fund') {
    body = <Panel title="Add to your emergency fund" hint={math.shortfall !== null ? `${moneyUsd(Number(math.shortfall) / 1_000_000)} to go. You sign it in your wallet.` : 'You sign it in your wallet.'} onClose={close}>
      <Amount value={amount} onChange={setAmount} label="How much, in USDC" />
      <Btn size="sm" disabled={!valid} onClick={() => { onCard('deposit', n!); close() }}>Show the deposit card</Btn>
    </Panel>
  } else if (step?.s === 'list') {
    const list = editableHoldings(p, 'all')
    const row = (h: Holding) => <Line key={h.id} label={h.name} value={shown(h)} onClick={() => go({ s: 'item', holding: h }, String(editsQuantity(h) ? h.quantity : h.value ?? ''))} />
    const others = list.filter(h => partOf(h) === null)
    const c = p?.cryptoSplit ?? 50
    body = <Panel title="Your portfolio" onClose={close}>
      {(['safe', 'traditional', 'crypto'] as const).map(part => {
        const items = list.filter(h => partOf(h) === part)
        return items.length ? <div key={part} className="flex flex-col"><Group>{PART_LABEL[part]}</Group>{items.map(row)}</div> : null
      })}
      {others.length > 0 && <div className="flex flex-col"><Group>Other</Group>{others.map(row)}</div>}
      {!list.length && <Hint>Nothing here yet.</Hint>}
      <Line label="Add something" icon={Plus} onClick={() => go({ s: 'choose', part: 'all' })} />
      {math.investUnlocked && <Line label="Traditional / Crypto split" value={`${100 - c} / ${c}`} onClick={() => { setPicked(c); go({ s: 'split' }) }} />}
    </Panel>
  } else if (step?.s === 'item') {
    const h = step.holding
    const back: Step = { s: 'list' }
    const qty = editsQuantity(h)
    const was = qty ? `${h.quantity} ${h.unit ?? ''}`.trim() : native(h.value ?? 0, h.currency ?? 'USDC')
    const now = !valid ? '' : qty ? `${n} ${h.unit ?? ''}`.trim() : native(n!, h.currency ?? 'USDC')
    body = <Panel title={h.name} hint={qty ? 'The value follows the live price.' : 'What it is worth now, not what you paid.'} onBack={() => setStep(back)} onClose={close}>
      <Amount value={amount} onChange={setAmount} label={qty ? `How many ${h.unit ?? 'units'}` : h.currency === 'VND' ? 'Worth now, in VND' : 'Worth now, in USD'} />
      <Btn size="sm" disabled={!valid} onClick={() => confirm(`${h.name}: ${was} → ${now}`, [editHoldingOp(h, n!)], `Saved: ${h.name} is now ${now}.`, step)}>Save</Btn>
      <Btn size="sm" variant="outline" onClick={() => confirm(`Remove ${h.name} (${was})`, [removeHoldingOp(h)], `Removed: ${h.name}.`, step)}>Remove</Btn>
    </Panel>
  } else if (step?.s === 'choose') {
    const parts: Part[] = step.part === 'all' ? ['safe', 'traditional', 'crypto'] : [step.part]
    const preset = step.amount
    const back: Step = preset !== undefined ? { s: 'parts', amount: preset } : { s: 'list' }
    body = <Panel title={parts.length > 1 ? 'Which part?' : 'What is it?'} hint={parts.length === 1 && parts[0] === 'safe' ? 'Safety is only for low-volatility money, so it steadies your whole picture.' : undefined} onBack={() => setStep(back)} onClose={close}>
      {parts.length > 1
        ? parts.map(part => <Line key={part} label={PART_LABEL[part]} onClick={() => go({ s: 'choose', part })} />)
        : ASSET_CHOICES[parts[0]].map(c => <Line key={c.type + c.name} label={c.label} onClick={() => go({ s: 'new', choice: c, amount: preset }, preset !== undefined ? String(preset) : '')} />)}
    </Panel>
  } else if (step?.s === 'new') {
    const c = step.choice
    const ask = c.asksName
    const label = (name.trim() || c.name)
    body = <Panel title={c.label} hint={c.hint} onBack={() => setStep({ s: 'choose', part: partOfChoice(c), amount: step.amount })} onClose={close}>
      {ask && <Text value={name} onChange={setName} label={c.type === 'fund_bond' ? 'Which one (VOO, for example)' : 'Which coin'} />}
      <Amount value={amount} onChange={setAmount} label="Worth now, in USD" />
      <Btn size="sm" disabled={!valid || (ask && !name.trim())} onClick={() => confirm(`Add ${label}: ${moneyUsd(n!)} in ${PART_LABEL[partOfChoice(c)]}`, [addHoldingOp(c, n!, name)], `Saved: ${label}, ${moneyUsd(n!)} in ${PART_LABEL[partOfChoice(c)]}.`, step)}>Save</Btn>
    </Panel>
  } else if (step?.s === 'month') {
    const lines = monthLines(p)
    const sub = (l: MonthLine) => l.kind === 'debt' ? 'Debt, still owed' : l.kind === 'income' ? 'Income a month' : 'Spending a month'
    body = <Panel title="Your month" hint="Your emergency fund target follows these numbers." onClose={close}>
      {lines.map(l => <Line key={l.item.id} label={l.item.name} sub={sub(l)} value={native(lineAmount(l), l.item.currency)} onClick={() => go({ s: 'line', line: l }, String(lineAmount(l)))} />)}
      <Line label="Add income" icon={Plus} onClick={() => go({ s: 'newLine', kind: 'income' })} />
      <Line label="Add spending" icon={Plus} onClick={() => go({ s: 'newLine', kind: 'expense' })} />
    </Panel>
  } else if (step?.s === 'line') {
    const l = step.line
    const c = l.item.currency
    body = <Panel title={l.item.name} onBack={() => setStep({ s: 'month' })} onClose={close}>
      <Amount value={amount} onChange={setAmount} label={l.kind === 'debt' ? `Still owed, in ${c === 'VND' ? 'VND' : 'USD'}` : `A month, in ${c === 'VND' ? 'VND' : 'USD'}`} />
      <Btn size="sm" disabled={!valid} onClick={() => confirm(`${l.item.name}: ${native(lineAmount(l), c)} → ${native(n!, c)}`, [editLineOp(l, n!)], `Saved: ${l.item.name} is now ${native(n!, c)}.`, step)}>Save</Btn>
      <Btn size="sm" variant="outline" onClick={() => confirm(l.kind === 'debt' ? `${l.item.name} is paid off` : `Remove ${l.item.name}`, [removeLineOp(l)], l.kind === 'debt' ? `Saved: ${l.item.name} is paid off.` : `Removed: ${l.item.name}.`, step)}>{l.kind === 'debt' ? 'Paid off' : 'Remove'}</Btn>
    </Panel>
  } else if (step?.s === 'newLine') {
    const word = step.kind === 'income' ? 'income' : 'spending'
    body = <Panel title={`Add ${word}`} onBack={() => setStep({ s: 'month' })} onClose={close}>
      <Text value={name} onChange={setName} label="What is it" />
      <Amount value={amount} onChange={setAmount} label="A month, in USD" />
      <Btn size="sm" disabled={!valid} onClick={() => confirm(`Add ${name.trim() || word}: ${moneyUsd(n!)} a month`, [addLineOp(step.kind, name, n!)], `Saved: ${name.trim() || word}, ${moneyUsd(n!)} a month.`, step)}>Save</Btn>
    </Panel>
  } else if (step?.s === 'split') {
    const was = p?.cryptoSplit ?? 50
    const c = picked ?? was
    body = <Panel title="Traditional / Crypto" hint="50 / 50 is MoonSafe's default. You can lean to Traditional; Crypto stays at 50% or less because it swings so much." onBack={() => setStep({ s: 'list' })} onClose={close}>
      <div role="radiogroup" aria-label="Traditional / Crypto split" className="flex flex-wrap gap-2">
        {SPLIT_CHOICES.map(v => {
          const on = c === v
          return <button key={v} role="radio" aria-checked={on} onClick={() => setPicked(v)} className="h-10 px-4 rounded-full text-[14px] leading-5 font-semibold"
            style={on ? { background: 'var(--accent)', color: 'white', border: '1px solid var(--accent)' } : { background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--line)' }}>{100 - v} / {v}</button>
        })}
      </div>
      <Btn size="sm" disabled={c === was} onClick={() => confirm(`Traditional ${100 - c}% / Crypto ${c}%`, [splitOp(c)], `Saved: outside Safety your split is now Traditional ${100 - c}% / Crypto ${c}%.`, step)}>Save</Btn>
    </Panel>
  } else if (step?.s === 'add') {
    body = <Panel title="Add money" hint="New money to put to work. Your emergency fund is full, so it can go to the three parts." onClose={close}>
      <Amount value={amount} onChange={setAmount} label="How much, in USD" />
      <Btn size="sm" disabled={!valid} onClick={() => setStep({ s: 'parts', amount: n! })}>Next</Btn>
    </Panel>
  } else if (step?.s === 'parts') {
    const split = shares ? splitAmount(step.amount, shares) : null
    const amt = step.amount
    body = <Panel title={`${moneyUsd(amt)} by your age`} hint="This is the guide. Tap where you are putting the money; the order is yours." onBack={() => go({ s: 'add' }, String(amt))} onClose={close}>
      {(['safe', 'traditional', 'crypto'] as const).map(part => (
        <Line key={part} label={PART_LABEL[part]} value={split ? moneyUsd(split[part]) : undefined} onClick={() => part === 'crypto' ? setStep({ s: 'crypto', amount: split?.crypto ?? amt }) : go({ s: 'choose', part, amount: split?.[part] ?? amt })} />
      ))}
    </Panel>
  } else if (step?.s === 'crypto') {
    const btc = btcPart(step.amount)
    body = <Panel title={`Crypto: ${moneyUsd(step.amount)}`} hint={`A guide: of every $10, about $7 in Bitcoin, the rest your pick. Every coin counts.`} onClose={close}>
      <Line label="Buy Bitcoin here (cirBTC)" value={moneyUsd(btc)} onClick={() => { onCard('buy', btc); close() }} />
      <Line label="I bought elsewhere" onClick={() => go({ s: 'choose', part: 'crypto', amount: step.amount })} />
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
      {body && <div ref={panel} className="rounded-2xl p-4 overflow-y-auto no-scrollbar" style={{ background: 'var(--bg)', boxShadow: 'var(--shadow-y2)', maxHeight: 'min(440px, 55dvh)' }}>{body}</div>}
      <div className="flex flex-wrap gap-2">
        {chips.map(({ id, label }) => {
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

const partOfChoice = (c: AssetChoice): Part => (['safe', 'traditional', 'crypto'] as const).find(part => ASSET_CHOICES[part].includes(c)) ?? 'crypto'

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

function Line({ label, sub, value, icon: Icon, onClick }: { label: string; sub?: string; value?: string; icon?: LucideIcon; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full min-h-12 py-2 flex items-center gap-2 text-left" style={{ borderBottom: '1px solid var(--line)' }}>
      {Icon && <Icon size={16} className="flex-shrink-0" style={{ color: 'var(--accent)' }} />}
      <span className="flex-1 min-w-0">
        <span className="block text-[16px] leading-6 truncate" style={{ color: Icon ? 'var(--accent)' : 'var(--ink)' }}>{label}</span>
        {sub && <span className="block text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>{sub}</span>}
      </span>
      {value && <span className="flex-shrink-0 text-[16px] leading-6 tabular-nums" style={{ color: 'var(--ink)' }}>{value}</span>}
      {!Icon && <ChevronRight size={16} className="flex-shrink-0" style={{ color: 'var(--muted)' }} />}
    </button>
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
