// "AI power": the meter above the chat box and the sheet behind it. Every message uses a little AI power; the free
// allowance refills at 00:00 UTC, and more can be charged (bought). Server rules: functions/_lib/quota.ts.

import { useState } from 'react'
import { Zap } from 'lucide-react'
import { usePrivy } from '@privy-io/react-auth'
import { useAccount, usePublicClient, useSendTransaction, useSignMessage, useSwitchChain } from 'wagmi'
import { useNow } from '@/hooks/useNow'
import { messagesLeft, type AiPower } from '@/hooks/useAiPower'
import { txErrorMessage } from '@/hooks/useVault'
import { ensureArcChain } from '@/lib/chain'
import { CHAIN_ID, IS_MAINNET } from '@/lib/network'
import { DEFAULT_POWER_PAYMENT_ADDRESS, POWER_PRICE_NATIVE, powerMemo } from '@/lib/power'
import { Btn, Notice, Sheet } from '@/components/ui/kit'

function untilReset(resetsAt: number, now: number): string {
  const min = Math.max(0, Math.ceil((resetsAt - now) / 60_000))
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`
}

/** The thin strip above the composer. */
export function PowerMeter({ power, onOpen }: { power: AiPower; onOpen: () => void }) {
  const left = messagesLeft(power)
  const out = left <= 0
  const low = !out && left <= 5
  const color = out ? 'var(--danger)' : low ? 'var(--warning, #B45309)' : 'var(--subtle)'
  const pct = Math.min(100, Math.round((Math.max(0, power.limit - power.used) / power.limit) * 100))
  return (
    <button onClick={onOpen} className="flex-shrink-0 flex items-center gap-2 px-4 lg:px-6 pt-2 text-left" aria-label="AI power">
      <Zap size={16} style={{ color }} />
      <span className="text-[14px] leading-5 font-semibold" style={{ color }}>
        {out ? 'Out of AI power' : `AI power · ${left} message${left === 1 ? '' : 's'} left today`}
      </span>
      <span className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--line)' }} aria-hidden>
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: out ? 'var(--danger)' : 'var(--accent)' }} />
      </span>
      <span className="flex-shrink-0 h-8 px-4 rounded-full flex items-center text-[14px] leading-5 font-semibold"
        style={out ? { background: 'var(--accent)', color: 'white' } : { background: 'var(--surface-muted)', color: 'var(--accent)' }}>
        {out ? 'Recharge' : 'Top up'}
      </span>
    </button>
  )
}

export function PowerSheet({ power, verifyOwner, buy, onClose }: {
  power: AiPower
  verifyOwner: (sign: (message: string) => Promise<string>) => Promise<void>
  buy: (txHash: string) => Promise<void>
  onClose: () => void
}) {
  const now = useNow()
  const { address, connector } = useAccount()
  const { user } = usePrivy()
  const { signMessageAsync } = useSignMessage()
  const { sendTransactionAsync } = useSendTransaction()
  const { switchChainAsync } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const [busy, setBusy] = useState(false)
  const [buying, setBuying] = useState(false)
  const [bought, setBought] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A payment that was sent but not yet counted is remembered, so a slow confirmation never leads to a second payment
  // (security review 2026-10-29): the button then re-checks it instead of paying again.
  const pendingKey = `moonsafe_power_pending:${user?.id ?? ''}`
  const [pending, setPending] = useState<string | null>(() => { try { return localStorage.getItem(pendingKey) } catch { return null } })
  const settle = async (hash: string) => {
    await buy(hash)
    try { localStorage.removeItem(pendingKey) } catch { /* private mode */ }
    setPending(null); setBought(true)
  }

  // 1 USDC to the payment address, with this account's memo as calldata (src/lib/power.ts); the server checks it onchain.
  // The address and the price are the ones baked into this app, NOT whatever the server says: a wrong server answer must never
  // be able to make the wallet ask for another destination or amount (security review 2026-10-29).
  const purchase = async () => {
    if (!user?.id || !publicClient) return
    setBuying(true); setError(null); setBought(false)
    try {
      if (pending) { await settle(pending); return }
      if (power.paymentAddress.toLowerCase() !== DEFAULT_POWER_PAYMENT_ADDRESS || BigInt(power.pricePerPurchase) !== POWER_PRICE_NATIVE) {
        throw new Error('The payment details from the server do not match this app, so nothing was sent. Please contact MoonSafe.')
      }
      // Only a plain wallet (or an email wallet) can pay: the server credits a payment whose top-level destination is ours.
      if (address) {
        const code = await publicClient.getCode({ address })
        if (code && code !== '0x' && !code.toLowerCase().startsWith('0xef0100')) throw new Error('Smart-contract wallets cannot pay for AI power yet. Use a normal wallet or your email wallet.')
      }
      await ensureArcChain(connector, switchChainAsync)
      const hash = await sendTransactionAsync({ to: DEFAULT_POWER_PAYMENT_ADDRESS as `0x${string}`, value: POWER_PRICE_NATIVE, data: powerMemo(user.id), chainId: CHAIN_ID })
      try { localStorage.setItem(pendingKey, hash) } catch { /* private mode */ }
      setPending(hash)
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 })
      if (receipt.status !== 'success') { try { localStorage.removeItem(pendingKey) } catch { /* */ } setPending(null); throw new Error('The payment was rejected onchain') }
      await settle(hash)
    } catch (e) { setError(txErrorMessage(e)) }
    finally { setBuying(false) }
  }
  const canUnlock = !power.ownerVerified && !!address && address.toLowerCase() === power.ownerWallet

  const unlock = async () => {
    setBusy(true); setError(null)
    try { await verifyOwner(message => signMessageAsync({ message })) }
    catch (e) { setError(/reject|denied/i.test((e as Error).message) ? 'You declined to sign in your wallet.' : (e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <Sheet>
      <div className="flex items-center gap-2">
        <Zap size={24} style={{ color: 'var(--accent)' }} />
        <p className="display font-bold text-[20px] leading-7" style={{ color: 'var(--ink)' }}>AI power</p>
      </div>
      <p className="text-[16px] leading-6" style={{ color: 'var(--ink)' }}>
        Every message you send to the agent uses a little AI power. You get <strong>{power.limit} messages a day</strong>{power.boosted ? ' (owner allowance)' : ''}.
        It refills at 00:00 UTC, in {untilReset(power.resetsAt, now)}.
      </p>
      <div className="flex gap-4 p-4 rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
        <div className="flex-1 text-center">
          <p className="text-[20px] leading-7 font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{Math.max(0, power.limit - power.used)} / {power.limit}</p>
          <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Free today</p>
        </div>
        <div className="flex-1 text-center">
          <p className="text-[20px] leading-7 font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{power.extra}</p>
          <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Charged, saved for later</p>
        </div>
      </div>
      {IS_MAINNET && power.canRecharge ? (
        <>
          <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>
            Need more? 1 USDC adds {power.messagesPerPurchase} messages that never expire. They are used after the free messages.
          </p>
          {bought && <Notice tone="success">{power.messagesPerPurchase} messages added.</Notice>}
          {pending && <Notice tone="info">A payment was sent but is not counted yet. Check it instead of paying again.</Notice>}
          <Btn loading={buying} onClick={() => { void purchase() }}>{pending ? 'Check my payment' : `Buy ${power.messagesPerPurchase} messages · 1 USDC`}</Btn>
        </>
      ) : (
        <Notice tone="info" title="Need more?">
          Buying extra AI power is available on Arc mainnet. Bought power never expires and is used after the free messages.
        </Notice>
      )}
      {canUnlock && (
        <>
          <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>This is the owner wallet. Sign once to raise your allowance (no fee, nothing is sent onchain).</p>
          <Btn variant="outline" loading={busy} onClick={() => { void unlock() }}>Unlock the owner allowance</Btn>
        </>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <Btn variant="outline" onClick={onClose}>Close</Btn>
    </Sheet>
  )
}
