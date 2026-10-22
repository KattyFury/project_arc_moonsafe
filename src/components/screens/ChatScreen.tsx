// Screen 6 — chat with the agent. There is no declaration form: what the user tells the
// agent (income, spending, debt…) is saved straight to the profile in this browser; they
// can read it in Cân đối, correct it by telling the agent, or clear it in Menu.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/state/AppState'
import { WELCOME, WELCOME_BACK, useAgent, type AgentAction } from '@/hooks/useAgent'
import { normalizeProfile, unitOf } from '@/hooks/useFinancialProfile'
import { dcaNextRun } from '@/hooks/useCirBtc'
import { useNow } from '@/hooks/useNow'
import { formatUsdc } from '@/lib/format'
import { EMPTY_PROFILE, MONEY_FIELDS, type FinancialProfile, type MoneyField } from '@/types'
import { Notice } from '@/components/ui/kit'

function renderContent(text: string): ReactNode {
  return text.split('\n').map((line, i, arr) => (
    <span key={i}>
      {line.split(/\*\*(.*?)\*\*/g).map((p, j) => (j % 2 === 1 ? <strong key={j}>{p}</strong> : p))}
      {i < arr.length - 1 && <br />}
    </span>
  ))
}

const Avatar = () => <img src="/logo.svg" alt="" width={32} height={32} className="flex-shrink-0" />

export function ChatScreen({ onError, onOpenInvest, onActions }: { onError: (m: string | null) => void; onOpenInvest: () => void; onActions: (a: AgentAction[]) => void }) {
  const { profile, vault, math, cirBtc } = useApp()
  const now = useNow()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { messages, loading, sendMessage } = useAgent({
    getContext: () => ({
      profile: profile.profile,
      profileSaved: profile.complete,
      vaultBalanceUsdc: vault.vaultBalance !== null ? formatUsdc(vault.vaultBalance) : null,
      walletBalanceUsdc: vault.walletBalance !== null ? formatUsdc(vault.walletBalance) : null,
      floorMonths: math.floorMonths,
      floorUsdc: math.floorUsdc !== null ? formatUsdc(math.floorUsdc) : null,
      shortfallUsdc: math.shortfall !== null ? formatUsdc(math.shortfall) : null,
      floorReachedPct: math.floorPct !== null ? Math.round(math.floorPct) : null,
      vaultMonths: math.vaultMonths !== null ? Math.round(math.vaultMonths * 10) / 10 : null,
      investUnlocked: math.investUnlocked,
      dca: cirBtc.dca ? { amountUsdc: formatUsdc(BigInt(cirBtc.dca.amountUsdc)), everyDays: cirBtc.dca.intervalDays } : null,
    }),
    onProfileDraft: raw => {
      const found = normalizeProfile(raw)
      const base = profile.profile ?? EMPTY_PROFILE
      const next: FinancialProfile = { ...base, units: { ...base.units } }
      for (const k of Object.keys(found) as (keyof FinancialProfile)[]) {
        if (k === 'savedAt' || k === 'units' || found[k] === null || found[k] === undefined) continue
        ;(next as unknown as Record<string, unknown>)[k] = found[k]
        // Keep the currency the agent heard (USDC salary) next to the number.
        if ((MONEY_FIELDS as readonly string[]).includes(k)) next.units = { ...next.units, [k]: unitOf(found, k as MoneyField) }
      }
      profile.saveProfile(next)
    },
    onDcaStop: () => { cirBtc.stopDca(); toast('Đã dừng DCA') },
    onActions,
  })

  const count = messages.length
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [count, loading])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    onError(null)
    await sendMessage(text)
    inputRef.current?.focus()
  }, [input, loading, sendMessage, onError])

  const dcaDue = math.investUnlocked && cirBtc.dca !== null && (dcaNextRun(cirBtc.dca) ?? Infinity) <= now

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full lg:max-w-[840px] lg:mx-auto lg:px-6 lg:py-12">
      <div className="flex flex-col flex-1 min-h-0 lg:rounded-2xl lg:shadow-[0_2px_8px_0_rgba(0,0,0,0.32)] lg:overflow-hidden" style={{ background: 'var(--bg)' }}>
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 lg:p-6 flex flex-col gap-4 [&>*]:flex-shrink-0">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 items-end ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && <Avatar />}
              <div className="max-w-[85%] px-4 py-4 text-[16px] leading-6 rounded-2xl"
                style={msg.role === 'user'
                  ? { background: 'var(--accent)', color: 'white' }
                  : msg.error
                    ? { background: '#FDE8EB', color: 'var(--danger)' }
                    : { background: 'var(--surface-muted)', color: 'var(--ink)' }}>
                {renderContent(msg.timestamp === 0 ? (profile.complete ? WELCOME_BACK : WELCOME.content) : msg.content)}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-2 items-end justify-start">
              <Avatar />
              <div className="px-4 py-4 rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
                <div className="dot-typing flex gap-2"><span /><span /><span /></div>
              </div>
            </div>
          )}

          {dcaDue && (
            <Notice tone="info" title="Đến kỳ mua DCA">
              <button className="underline" onClick={onOpenInvest}>Mở Đầu tư để xem báo giá và ký</button>
            </Notice>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="flex-shrink-0 flex gap-2 items-center px-4 py-4 lg:px-6 lg:pb-6 lg:pt-0" style={{ background: 'var(--bg)' }}>
          <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() } }}
            placeholder="Nhắn với agent…" aria-label="Tin nhắn"
            className="flex-1 min-w-0 h-12 px-4 rounded-full text-[16px] leading-6 outline-none border border-[var(--line)] focus:border-2 focus:border-[var(--accent)] placeholder:text-[var(--muted)]"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }} />
          <button onClick={() => { void handleSend() }} disabled={loading || !input.trim()} aria-label="Gửi"
            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
            style={loading || !input.trim()
              ? { background: 'var(--line)', color: 'var(--muted)' }
              : { background: 'var(--accent)', color: 'white', boxShadow: 'var(--shadow-y2)' }}>
            {loading ? <Loader2 size={24} className="animate-spin" /> : <Send size={24} />}
          </button>
        </div>
      </div>
    </div>
  )
}
