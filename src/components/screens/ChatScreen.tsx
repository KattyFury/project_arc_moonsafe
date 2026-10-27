// Screen 6 — chat with the agent. There is no declaration form: what the user tells the
// agent (income, spending, debts, holdings…) is saved straight to the profile; they can read it
// in Balance, correct it by telling the agent, or clear it in Menu.

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/state/AppState'
import { WELCOME, WELCOME_BACK, readChatExtras, useAgent, writeChatExtras, type AgentAction, type StoredCard } from '@/hooks/useAgent'
import { dcaNextRun } from '@/hooks/useCirBtc'
import { useNow } from '@/hooks/useNow'
import { isOutOfPower, useAiPower } from '@/hooks/useAiPower'
import { PowerMeter, PowerSheet } from '@/components/chat/AiPower'
import { DCA_AVAILABLE } from '@/lib/features'
import { formatUsdc } from '@/lib/format'
import { GlassCard } from '@/components/ui/kit'
import { ActionCard, type ChatAction } from '@/components/chat/ActionCard'
import { RecordCard } from '@/components/chat/RecordCard'
import type { AssetType } from '@/types'
import { AllocationPies } from '@/components/ui/AllocationPies'
import { CashflowCard } from '@/components/ui/CashflowCard'

const FADE_TOP = { maskImage: 'linear-gradient(to bottom, transparent 0, #000 48px)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 48px)' }

function renderContent(text: string): ReactNode {
  return text.split('\n').map((line, i, arr) => (
    <span key={i}>
      {line.split(/\*\*(.*?)\*\*/g).map((p, j) => (j % 2 === 1 ? <strong key={j}>{p}</strong> : p))}
      {i < arr.length - 1 && <br />}
    </span>
  ))
}

const Avatar = () => <img src="/logo.svg" alt="" width={32} height={32} className="flex-shrink-0" />

export function ChatScreen({ onError, onActions }: { onError: (m: string | null) => void; onActions: (a: AgentAction[]) => void }) {
  const { profile, vault, math, cirBtc, vndToUsdc } = useApp()
  // Deposit / withdraw / buy / DCA cards and charts under the agent's replies, by reply timestamp.
  // Stored, so a chat remounted mid-signature (wallet switching network) keeps them (real chat 2026-10-27).
  const [extras, setExtras] = useState(readChatExtras)
  useEffect(() => { writeChatExtras(extras) }, [extras])
  const cards: ChatAction[] = extras.cards.flatMap(c => c.kind === 'record' ? [] : [{ ...c, amount: BigInt(c.amount), intervalDays: c.intervalDays ?? 7 }])
  const records = extras.cards.flatMap(c => c.kind === 'record' ? [c] : [])
  const handleActions = (actions: AgentAction[], at: number) => {
    const screens = actions.filter(a => a.type === 'open_screen')
    if (screens.length) onActions(screens)
    const shown = actions.filter(a => a.type === 'show_allocation' || a.type === 'show_cashflow')
    const next: StoredCard[] = []
    for (const a of actions) {
      // "I put 1,000 in my bank": a box to confirm the source, then the app saves it.
      if (a.type === 'confirm_record') {
        if (a.amount && a.holdingType && a.name) next.push({ id: Date.now() + next.length, at, kind: 'record', record: { amountUsd: a.amount.amount, holdingType: a.holdingType as AssetType, name: a.name, source: a.source ?? null } })
        continue
      }
      if (a.type === 'open_screen' || a.type === 'show_allocation' || a.type === 'show_cashflow' || !a.amount) continue
      const amount = a.amount.currency === 'USDC' ? BigInt(Math.round(a.amount.amount * 1_000_000)) : vndToUsdc(a.amount.amount)
      if (amount === null || amount <= 0n) { toast.error('Could not convert the amount (no exchange rate). Please say it in USDC.'); continue }
      const base = { id: Date.now() + next.length, at, amount: amount.toString() }
      next.push(a.type === 'propose_dca'
        ? { ...base, kind: 'dca', intervalDays: a.intervalDays && a.intervalDays > 0 ? a.intervalDays : 7 }
        : { ...base, kind: a.type === 'prepare_deposit' ? 'deposit' : a.type === 'prepare_withdraw' ? 'withdraw' : 'buy' })
    }
    if (next.length || shown.length) setExtras(x => ({
      cards: [...x.cards, ...next].slice(-40),
      charts: [...x.charts, ...shown.map(a => ({ at, kind: a.type === 'show_cashflow' ? 'cashflow' as const : 'allocation' as const }))].slice(-40),
    }))
  }
  // A signed card tells the agent (hidden message), so it carries on instead of going quiet (real chat 2026-10-27).
  // Sent after the next render, so the context it reads has the refreshed balances.
  const [signed, setSigned] = useState<string | null>(null)
  const finishCard = (id: number, status: 'done' | 'cancelled', summary: string) => {
    const kind = extras.cards.find(c => c.id === id)?.kind
    setExtras(x => ({ ...x, cards: x.cards.map(c => c.id === id ? { ...c, status } : c) }))
    // A DCA approval buys nothing yet: tell the agent so it does not say "signed" (real chat 2026-10-27).
    if (status === 'done') setSigned(kind === 'record' ? `[app event] The user confirmed recording: ${summary}` : kind === 'dca' ? `[app event] The user approved the DCA plan: ${summary}` : `[app event] The user signed the card: ${summary}`)
  }
  const now = useNow()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { power, setPower, verifyOwner } = useAiPower()
  const [powerOpen, setPowerOpen] = useState(false)
  const outOfPower = isOutOfPower(power)
  const { messages, loading, sendMessage } = useAgent({
    // The server recomputes every figure and the buy lock from these (src/lib/allocation.ts computeBalance).
    getContext: () => ({
      profile: profile.profile,
      vaultUsdc: vault.vaultBalance !== null ? Number(vault.vaultBalance) / 1_000_000 : null,
      walletUsdc: vault.walletBalance !== null ? Number(vault.walletBalance) / 1_000_000 : null,
      cirBtcUsdc: cirBtc.balance === 0n ? 0 : cirBtc.valueUsdc6 !== null ? Number(cirBtc.valueUsdc6) / 1_000_000 : null,
      dca: cirBtc.dca ? { amountUsdc: formatUsdc(BigInt(cirBtc.dca.amountUsdc)), everyDays: cirBtc.dca.intervalDays } : null,
    }),
    onOps: profile.apply,
    onDcaStop: () => { cirBtc.stopDca(); toast('DCA stopped') },
    onActions: handleActions,
    onPower: p => { if (p) { setPower(p); if (isOutOfPower(p)) setPowerOpen(true) } },
  })

  const count = messages.length
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [count, loading])
  useEffect(() => {
    if (!signed || loading) return
    setSigned(null)
    void sendMessage(signed, true)
  }, [signed, loading, sendMessage])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading || outOfPower) return
    setInput('')
    onError(null)
    await sendMessage(text)
    inputRef.current?.focus()
  }

  const [scrolled, setScrolled] = useState(false)
  const dcaDue = DCA_AVAILABLE && math.investUnlocked && cirBtc.dca !== null && (dcaNextRun(cirBtc.dca) ?? Infinity) <= now
  // The DCA round that is due is bought right here in the chat (card), not in another tab; the card stays after the purchase.
  const [dueDone, setDueDone] = useState<bigint | null>(null)
  const dueAmount = dcaDue && cirBtc.dca ? BigInt(cirBtc.dca.amountUsdc) : dueDone

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full lg:max-w-[840px] lg:mx-auto lg:px-6 lg:py-12">
      <div className="flex flex-col flex-1 min-h-0 lg:rounded-2xl lg:shadow-[0_2px_8px_0_rgba(0,0,0,0.32)] lg:overflow-hidden" style={{ background: 'var(--bg)' }}>
        {/* Messages above the fold fade out under the nav bar, so it reads as "there is more". */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 lg:p-6 flex flex-col gap-4 [&>*]:flex-shrink-0"
          onScroll={e => setScrolled(e.currentTarget.scrollTop > 0)} style={scrolled ? FADE_TOP : undefined}>
          {messages.map((msg, i) => msg.hidden ? null : (
            <Fragment key={i}>
              <div className={`flex gap-2 items-end ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && <Avatar />}
                <div className="max-w-[85%] px-4 py-4 text-[16px] leading-6 rounded-2xl"
                  style={msg.role === 'user'
                    ? { background: 'var(--accent)', color: 'white' }
                    : msg.error
                      ? { background: '#FDE8EB', color: 'var(--danger)' }
                      : { background: 'var(--surface-muted)', color: 'var(--ink)' }}>
                  {renderContent(msg.timestamp === 0 ? (profile.known ? WELCOME_BACK : WELCOME.content) : msg.content)}
                </div>
              </div>
              {msg.role === 'assistant' && cards.filter(c => c.at === msg.timestamp).map(c => <ActionCard key={c.id} action={c} onFinished={(s, summary) => finishCard(c.id, s, summary)} />)}
              {msg.role === 'assistant' && records.filter(c => c.at === msg.timestamp).map(c => <RecordCard key={c.id} record={c.record} status={c.status} onFinished={(s, summary) => finishCard(c.id, s, summary)} />)}
              {msg.role === 'assistant' && extras.charts.filter(c => c.at === msg.timestamp).map((c, k) => <GlassCard key={k} className="ml-10 p-4">{c.kind === 'cashflow' ? <CashflowCard compact /> : <AllocationPies compact />}</GlassCard>)}
            </Fragment>
          ))}

          {loading && (
            <div className="flex gap-2 items-end justify-start">
              <Avatar />
              <div className="px-4 py-4 rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
                <div className="dot-typing flex gap-2"><span /><span /><span /></div>
              </div>
            </div>
          )}

          {dueAmount !== null && (
            <ActionCard key="dca-due" title="DCA buy is due" action={{ id: -1, at: 0, kind: 'buy', amount: dueAmount, status: dueDone !== null ? 'done' : undefined }}
              onFinished={s => { if (s === 'done') { setDueDone(dueAmount); cirBtc.markDcaRun() } }} />
          )}
          <div ref={bottomRef} />
        </div>

        {power && <PowerMeter power={power} onOpen={() => setPowerOpen(true)} />}
        {powerOpen && power && <PowerSheet power={power} verifyOwner={verifyOwner} onClose={() => setPowerOpen(false)} />}

        {/* Composer */}
        <div className="flex-shrink-0 flex gap-2 items-center px-4 py-4 lg:px-6 lg:pb-6 lg:pt-0" style={{ background: 'var(--bg)' }}>
          <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() } }}
            placeholder={outOfPower ? 'Out of AI power · recharge to keep chatting' : 'Message the agent…'} aria-label="Message"
            className="flex-1 min-w-0 h-12 px-4 rounded-full text-[16px] leading-6 outline-none focus-visible:outline-none border border-[var(--line)] focus:border-2 focus:border-[var(--accent)] placeholder:text-[var(--muted)]"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }} />
          <button onClick={() => { void handleSend() }} disabled={loading || outOfPower || !input.trim()} aria-label="Send"
            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
            style={loading || outOfPower || !input.trim()
              ? { background: 'var(--line)', color: 'var(--muted)' }
              : { background: 'var(--accent)', color: 'white', boxShadow: 'var(--shadow-y2)' }}>
            {loading ? <Loader2 size={24} className="animate-spin" /> : <Send size={24} />}
          </button>
        </div>
      </div>
    </div>
  )
}
