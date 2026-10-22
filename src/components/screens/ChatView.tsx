// Screen 6 — chat with the agent + the declaration card ("thẻ khai báo").
// The card is filled by the user or pre-filled by the agent; nothing is saved
// until the user taps "Lưu khai báo".

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Lock, Send } from 'lucide-react'
import clsx from 'clsx'
import type { ChatMessage, FinancialProfile } from '@/types'
import { isProfileComplete } from '@/hooks/useFinancialProfile'
import { Button, Card, NumberInput, Segmented, VndInput } from '@/components/ui/kit'

function renderContent(text: string): ReactNode {
  return text.split('\n').map((line, i, arr) => (
    <span key={i}>
      {line.split(/\*\*(.*?)\*\*/g).map((p, j) => (j % 2 === 1 ? <strong key={j}>{p}</strong> : p))}
      {i < arr.length - 1 && <br />}
    </span>
  ))
}

export function ChatMessages({ messages, loading, footer }: { messages: ChatMessage[]; loading: boolean; footer?: ReactNode }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const count = messages.length
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [count, loading])

  return (
    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2 py-2 px-1 -mx-1">
      {messages.map((m, i) => (
        <div key={i} className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
          <div className={clsx('max-w-[85%] px-4 py-2 rounded-md text-app-secondary',
            m.role === 'user' ? 'bg-blue text-on-blue'
              : m.error ? 'bg-red-soft text-red-text' : 'bg-mist text-ink')}>
            {renderContent(m.content)}
          </div>
        </div>
      ))}
      {loading && (
        <div className="flex justify-start" aria-label="Agent đang trả lời">
          <div className="px-4 py-4 rounded-md bg-mist dot-typing flex gap-1"><span /><span /><span /></div>
        </div>
      )}
      {footer && <div className="pt-2">{footer}</div>}
      <div ref={bottomRef} />
    </div>
  )
}

export function ChatInput({ value, onChange, onSend, disabled, lockedText }: {
  value: string; onChange: (v: string) => void; onSend: () => void; disabled?: boolean; lockedText?: string
}) {
  const locked = !!lockedText
  return (
    <form className="shrink-0 flex gap-2 pt-2" onSubmit={e => { e.preventDefault(); if (!disabled && !locked && value.trim()) onSend() }}>
      <div className={clsx('flex-1 h-12 px-4 rounded-md flex items-center gap-2 border',
        locked ? 'bg-ground border-dashed border-2 border-line' : 'bg-mist border-line focus-within:border-2 focus-within:border-blue')}>
        {locked && <Lock size={20} className="text-muted shrink-0" />}
        <input value={locked ? '' : value} onChange={e => onChange(e.target.value)} disabled={locked}
          placeholder={lockedText ?? 'Nhắn với agent…'} aria-label="Tin nhắn"
          className="flex-1 min-w-0 bg-transparent outline-none text-app-secondary text-ink placeholder:text-muted" />
      </div>
      <button type="submit" disabled={locked || disabled || !value.trim()} aria-label="Gửi"
        className={clsx('h-12 px-4 rounded-md inline-flex items-center gap-2 text-app-btn-sm',
          locked || disabled || !value.trim() ? 'bg-line text-muted' : 'bg-blue text-on-blue shadow-y2')}>
        {locked ? <Lock size={20} /> : <Send size={20} />}
        <span className="hidden min-[400px]:inline">Gửi</span>
      </button>
    </form>
  )
}

export function DeclarationCard({ draft, onChange, onSave, onClose, agentFilled }: {
  draft: FinancialProfile
  onChange: (p: FinancialProfile) => void
  onSave: () => void
  onClose?: () => void
  agentFilled: boolean
}) {
  const set = <K extends keyof FinancialProfile>(k: K, v: FinancialProfile[K]) => onChange({ ...draft, [k]: v })
  // "Có nợ" needs an amount, so keep the yes/no choice separately from the number.
  const [debt, setDebt] = useState<'no' | 'yes' | null>(draft.debtAmount === null ? null : draft.debtAmount === 0 ? 'no' : 'yes')
  useEffect(() => {
    if (draft.debtAmount !== null) setDebt(draft.debtAmount === 0 ? 'no' : 'yes')
  }, [draft.debtAmount])
  const ok = isProfileComplete(draft)

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-app-title-card text-ink">Thẻ khai báo</h2>
        {onClose && <button onClick={onClose} className="text-app-btn-sm text-blue">Đóng</button>}
      </div>
      {agentFilled && <p className="text-app-note text-blue-strong">Agent đã điền theo câu trả lời của bạn. Kiểm tra rồi bấm Lưu.</p>}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
        <VndInput label="Thu nhập / tháng" value={draft.monthlyIncome} onChange={v => set('monthlyIncome', v)} />
        <VndInput label="Chi tiêu thiết yếu / tháng" value={draft.monthlyExpenses} onChange={v => set('monthlyExpenses', v)} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-app-label text-grey">Nợ bên ngoài (ngân hàng, thẻ, trả góp…)</span>
        <Segmented value={debt ?? ('' as 'no')}
          onChange={v => { setDebt(v); set('debtAmount', v === 'no' ? 0 : null) }}
          options={[{ value: 'no', label: 'Không có nợ' }, { value: 'yes', label: 'Có nợ' }]} />
      </div>
      {debt === 'yes' && (
        <VndInput label="Tổng nợ" value={draft.debtAmount} onChange={v => set('debtAmount', v === 0 ? null : v)} />
      )}
      <div className="grid grid-cols-2 gap-2">
        <NumberInput label="Tuổi" value={draft.age} onChange={v => set('age', v)} />
        <div className="flex flex-col gap-1">
          <span className="text-app-label text-grey">Thu nhập</span>
          <Segmented value={draft.incomeStable === null ? ('' as 'y') : draft.incomeStable ? 'y' : 'n'}
            onChange={v => set('incomeStable', v === 'y')}
            options={[{ value: 'y', label: 'Ổn định' }, { value: 'n', label: 'Không' }]} />
        </div>
      </div>
      <VndInput label="Tài sản khác (vàng, BĐS ngoài nhà ở, cổ phiếu…), không bắt buộc" value={draft.otherAssets} onChange={v => set('otherAssets', v)} />
      <Button block disabled={!ok} onClick={onSave}>Lưu khai báo</Button>
      {!ok && <p className="text-app-caption text-muted text-center">Điền đủ thu nhập, chi tiêu, nợ, tuổi và độ ổn định để lưu.</p>}
    </Card>
  )
}
