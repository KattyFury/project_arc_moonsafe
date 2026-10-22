// Screen 6 — chat with the agent + declaration card (Arc Studio look).
// The agent only pre-fills the card; the user taps "Lưu khai báo" to save.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/state/AppState'
import { WELCOME_BACK, useAgent } from '@/hooks/useAgent'
import { isProfileComplete, normalizeProfile } from '@/hooks/useFinancialProfile'
import { dcaNextRun } from '@/hooks/useCirBtc'
import { useNow } from '@/hooks/useNow'
import { formatUsdc } from '@/lib/format'
import { EMPTY_PROFILE, type FinancialProfile } from '@/types'
import { Btn, GlassCard, Notice, NumField, Toggle, VndField } from '@/components/ui/kit'

function renderContent(text: string): ReactNode {
  return text.split('\n').map((line, i, arr) => (
    <span key={i}>
      {line.split(/\*\*(.*?)\*\*/g).map((p, j) => (j % 2 === 1 ? <strong key={j}>{p}</strong> : p))}
      {i < arr.length - 1 && <br />}
    </span>
  ))
}

const Avatar = () => (
  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mb-[2px] overflow-hidden bg-white" style={{ border: '1px solid var(--border)' }}>
    <img src="/logo.svg" alt="" width={28} height={28} />
  </div>
)

export function ChatScreen({ declareKey, onError, onOpenInvest }: { declareKey: number; onError: (m: string | null) => void; onOpenInvest: () => void }) {
  const { profile, vault, math, cirBtc } = useApp()
  const now = useNow()
  const [input, setInput] = useState('')
  const [declareOpen, setDeclareOpen] = useState(!profile.complete || declareKey > 0)
  const [draft, setDraft] = useState<FinancialProfile>(profile.profile ?? EMPTY_PROFILE)
  const [agentFilled, setAgentFilled] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { messages, loading, sendMessage } = useAgent({
    getContext: () => ({
      profile: profile.profile,
      profileSaved: profile.complete,
      vaultBalanceUsdc: vault.vaultBalance !== null ? formatUsdc(vault.vaultBalance) : null,
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
      setDraft(prev => {
        const next = { ...prev }
        for (const k of Object.keys(found) as (keyof FinancialProfile)[]) {
          if (k !== 'savedAt' && found[k] !== null && found[k] !== undefined) (next as Record<string, unknown>)[k] = found[k]
        }
        return next
      })
      setAgentFilled(true)
      setDeclareOpen(true)
    },
    onDcaStop: () => { cirBtc.stopDca(); toast('Đã dừng DCA') },
  })

  // Cleared elsewhere (Menu → Xoá khai báo) → empty card again.
  useEffect(() => {
    if (!profile.profile) { setDraft(EMPTY_PROFILE); setDeclareOpen(true) }
  }, [profile.profile])

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

  const save = () => {
    profile.saveProfile(draft)
    setDeclareOpen(false)
    setAgentFilled(false)
    toast.success('Đã lưu khai báo')
  }

  const dcaDue = math.investUnlocked && cirBtc.dca !== null && (dcaNextRun(cirBtc.dca) ?? Infinity) <= now

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ background: 'var(--bg)' }}>
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 flex flex-col gap-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 items-end ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && <Avatar />}
            <div className="max-w-[78%] px-4 py-3 text-[14px] leading-relaxed"
              style={msg.role === 'user'
                ? { background: 'var(--accent)', color: 'white', borderRadius: '18px 18px 4px 18px' }
                : msg.error
                  ? { background: 'rgba(224,52,74,0.07)', color: 'var(--danger)', border: '1px solid rgba(224,52,74,0.2)', borderRadius: '18px 18px 18px 4px' }
                  : { background: 'white', color: 'var(--ink)', border: '1px solid var(--border)', borderRadius: '18px 18px 18px 4px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              {renderContent(msg.timestamp === 0 && profile.complete ? WELCOME_BACK : msg.content)}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2 items-end justify-start">
            <Avatar />
            <div className="px-4 py-3" style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '18px 18px 18px 4px' }}>
              <div className="dot-typing flex gap-1"><span /><span /><span /></div>
            </div>
          </div>
        )}

        {dcaDue && (
          <Notice tone="info" title="Đến kỳ mua DCA">
            <button className="underline" onClick={onOpenInvest}>Mở Đầu tư để xem báo giá và ký</button>
          </Notice>
        )}

        {declareOpen && (
          <DeclarationCard draft={draft} onChange={setDraft} onSave={save} agentFilled={agentFilled}
            onClose={profile.complete ? () => setDeclareOpen(false) : undefined} />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 flex gap-3 items-center px-4 py-3" style={{ background: 'white', borderTop: '1px solid var(--border)' }}>
        <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() } }}
          placeholder="Nhắn với agent…" aria-label="Tin nhắn"
          className="flex-1 px-4 text-[15px] outline-none"
          style={{ height: 44, borderRadius: 22, background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }} />
        <button onClick={() => { void handleSend() }} disabled={loading || !input.trim()} aria-label="Gửi"
          className="flex items-center justify-center transition-all active:scale-95"
          style={{ width: 44, height: 44, borderRadius: 22, flexShrink: 0,
            background: loading || !input.trim() ? 'var(--surface-muted)' : 'var(--accent)',
            color: loading || !input.trim() ? 'var(--muted)' : 'white' }}>
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  )
}

function DeclarationCard({ draft, onChange, onSave, onClose, agentFilled }: {
  draft: FinancialProfile; onChange: (p: FinancialProfile) => void; onSave: () => void; onClose?: () => void; agentFilled: boolean
}) {
  const set = <K extends keyof FinancialProfile>(k: K, v: FinancialProfile[K]) => onChange({ ...draft, [k]: v })
  const [debt, setDebt] = useState<'no' | 'yes' | null>(draft.debtAmount === null ? null : draft.debtAmount === 0 ? 'no' : 'yes')
  useEffect(() => {
    if (draft.debtAmount !== null) setDebt(draft.debtAmount === 0 ? 'no' : 'yes')
  }, [draft.debtAmount])
  const ok = isProfileComplete(draft)

  return (
    <GlassCard className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-[15px]" style={{ color: 'var(--ink)' }}>Thẻ khai báo</p>
        {onClose && <button onClick={onClose} className="text-[13px] font-semibold" style={{ color: 'var(--accent)' }}>Đóng</button>}
      </div>
      {agentFilled && <p className="text-[12px]" style={{ color: 'var(--accent-dark)' }}>Agent đã điền theo câu trả lời của bạn. Kiểm tra rồi bấm Lưu.</p>}
      <div className="grid grid-cols-2 gap-2">
        <VndField label="Thu nhập / tháng" value={draft.monthlyIncome} onChange={v => set('monthlyIncome', v)} />
        <VndField label="Chi tiêu thiết yếu / tháng" value={draft.monthlyExpenses} onChange={v => set('monthlyExpenses', v)} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[12px] font-semibold" style={{ color: 'var(--subtle)' }}>Nợ bên ngoài</span>
        <Toggle value={debt} onChange={v => { setDebt(v); set('debtAmount', v === 'no' ? 0 : null) }}
          options={[{ value: 'no', label: 'Không có nợ' }, { value: 'yes', label: 'Có nợ' }]} />
      </div>
      {debt === 'yes' && <VndField label="Tổng nợ" value={draft.debtAmount} onChange={v => set('debtAmount', v === 0 ? null : v)} />}
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Tuổi" value={draft.age} onChange={v => set('age', v)} />
        <div className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold" style={{ color: 'var(--subtle)' }}>Thu nhập</span>
          <Toggle value={draft.incomeStable === null ? null : draft.incomeStable ? 'y' : 'n'} onChange={v => set('incomeStable', v === 'y')}
            options={[{ value: 'y', label: 'Ổn định' }, { value: 'n', label: 'Không' }]} />
        </div>
      </div>
      <VndField label="Tài sản khác (vàng, BĐS, cổ phiếu…) — không bắt buộc" value={draft.otherAssets} onChange={v => set('otherAssets', v)} />
      <Btn disabled={!ok} onClick={onSave}>Lưu khai báo</Btn>
      {!ok && <p className="text-[11px] text-center" style={{ color: 'var(--muted)' }}>Điền đủ thu nhập, chi tiêu, nợ, tuổi và độ ổn định để lưu.</p>}
    </GlassCard>
  )
}
