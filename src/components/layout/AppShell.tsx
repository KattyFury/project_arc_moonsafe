// The app after login: row 1 nav, chat (or vault setup) underneath, popups 7–10
// over the chat area, chat input at the bottom (row 10).
// No vault yet → Đầu tư + Cân đối locked, chat locked ("Mở vault để chat").

import { useCallback, useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import { Frame, useFrame } from './Frame'
import { NavBar } from './NavBar'
import { useApp } from '@/state/AppState'
import { useAgent } from '@/hooks/useAgent'
import { normalizeProfile } from '@/hooks/useFinancialProfile'
import { dcaNextRun } from '@/hooks/useCirBtc'
import { useNow } from '@/hooks/useNow'
import { EMPTY_PROFILE, type FinancialProfile, type Panel } from '@/types'
import { formatUsdc } from '@/lib/format'
import { Button, Modal, Notice, Spinner } from '@/components/ui/kit'
import { VaultSetup } from '@/components/screens/VaultSetup'
import { ChatInput, ChatMessages, DeclarationCard } from '@/components/screens/ChatView'
import { FundPanel } from '@/components/screens/FundPanel'
import { InvestPanel } from '@/components/screens/InvestPanel'
import { BalancePanel } from '@/components/screens/BalancePanel'
import { SettingsPanel } from '@/components/screens/SettingsPanel'

export function AppShell({ onLogout }: { onLogout: () => void }) {
  const { mode } = useFrame()
  const { address } = useAccount()
  const { vault, profile, cirBtc, math } = useApp()

  const [panel, setPanel] = useState<Panel | null>(null)
  const [lockNote, setLockNote] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [declareOpen, setDeclareOpen] = useState(!profile.complete)
  const [draft, setDraft] = useState<FinancialProfile>(profile.profile ?? EMPTY_PROFILE)
  const [agentFilled, setAgentFilled] = useState(false)

  const hasVault = !!vault.vaultAddress
  const now = useNow()

  const agent = useAgent({
    getContext: () => ({
      profile: profile.profile,
      profileSaved: profile.complete,
      hasVault,
      vaultBalanceUsdc: vault.vaultBalance !== null ? formatUsdc(vault.vaultBalance) : null,
      floorMonths: math.floorMonths,
      floorUsdc: math.floorUsdc !== null ? formatUsdc(math.floorUsdc) : null,
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

  // Keep the card in sync when the saved profile is cleared elsewhere.
  useEffect(() => {
    if (!profile.profile) { setDraft(EMPTY_PROFILE); setDeclareOpen(true) }
  }, [profile.profile])

  const openDeclare = useCallback(() => {
    setPanel(null)
    setDraft(profile.profile ?? EMPTY_PROFILE)
    setAgentFilled(false)
    setDeclareOpen(true)
  }, [profile.profile])

  const select = (p: Panel) => {
    if (!hasVault && (p === 'invest' || p === 'balance')) {
      setLockNote(p === 'invest' ? 'Mở vault quỹ dự phòng trước. Đầu tư chỉ mở khi không có nợ và quỹ đủ sàn.' : 'Mở vault quỹ dự phòng trước để xem bảng cân đối.')
      return
    }
    if (!hasVault && p === 'fund') { setPanel(null); return }
    setPanel(cur => (cur === p ? null : p))
  }

  const send = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    setPanel(null)
    void agent.sendMessage(text)
  }

  const save = () => {
    profile.saveProfile(draft)
    setDeclareOpen(false)
    setAgentFilled(false)
    toast.success('Đã lưu khai báo')
  }

  const dcaDue = math.investUnlocked && cirBtc.dca !== null && (dcaNextRun(cirBtc.dca) ?? Infinity) <= now

  const nav = (
    <NavBar mode={mode} active={panel} address={address} onSelect={select}
      locked={{ invest: !hasVault || !math.investUnlocked, balance: !hasVault }} />
  )

  let body
  if (!vault.ready) {
    body = <div className="flex-1 flex items-center justify-center"><Spinner label="Đang đọc vault…" /></div>
  } else if (!hasVault && vault.readError) {
    body = (
      <div className="flex-1 flex flex-col justify-center gap-4">
        <Notice tone="warning" title="Chưa đọc được dữ liệu từ Arc Testnet">Mạng có thể đang chậm. App tự thử lại mỗi 15 giây.</Notice>
        <div className="flex justify-center"><Button variant="secondary" onClick={() => { void vault.refresh() }}>Thử lại</Button></div>
      </div>
    )
  } else if (!hasVault) {
    body = <VaultSetup />
  } else {
    body = (
      <ChatMessages messages={agent.messages} loading={agent.loading} footer={
        <div className="flex flex-col gap-2">
          {dcaDue && (
            <Notice tone="info" title="Đến kỳ mua DCA">
              <button className="underline" onClick={() => setPanel('invest')}>Mở Đầu tư để xem báo giá và ký</button>
            </Notice>
          )}
          {declareOpen ? (
            <DeclarationCard draft={draft} onChange={setDraft} onSave={save} agentFilled={agentFilled}
              onClose={profile.complete ? () => setDeclareOpen(false) : undefined} />
          ) : null}
        </div>
      } />
    )
  }

  return (
    <Frame nav={nav}>
      <div className="relative flex-1 min-h-0 flex flex-col">
        {body}
        {hasVault && panel === 'fund' && <FundPanel onClose={() => setPanel(null)} onDeclare={openDeclare} />}
        {hasVault && panel === 'invest' && <InvestPanel onClose={() => setPanel(null)} onOpenFund={() => setPanel('fund')} onDeclare={openDeclare} />}
        {hasVault && panel === 'balance' && <BalancePanel onClose={() => setPanel(null)} onDeclare={openDeclare} />}
        {panel === 'settings' && (
          <SettingsPanel onClose={() => setPanel(null)} onLogout={onLogout}
            onClearAll={() => { profile.clearProfile(); agent.clearChat(); setPanel(null) }} />
        )}
      </div>
      <ChatInput value={input} onChange={setInput} onSend={send} disabled={agent.loading}
        lockedText={hasVault ? undefined : 'Mở vault để chat'} />
      {lockNote && (
        <Modal title="Đang khoá" onClose={() => setLockNote(null)}>
          <p className="text-app-note text-grey">{lockNote}</p>
          <Button block onClick={() => setLockNote(null)}>Đã hiểu</Button>
        </Modal>
      )}
    </Frame>
  )
}
