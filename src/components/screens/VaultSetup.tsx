// Screens 4 / 4b / 5 / 5b — open the personal vault (Arc Studio look).
// Fee is read from the factory; at most 5 signing attempts.

import { useState } from 'react'
import { CheckCircle2, ExternalLink, Lock, Shield } from 'lucide-react'
import { useAccount } from 'wagmi'
import { FACTORY_CONFIGURED } from '@/hooks/useVault'
import { IS_MAINNET, NET } from '@/lib/network'
import { useApp } from '@/state/AppState'
import { GAS_ESTIMATE_USDC6, txErrorMessage } from '@/hooks/useVault'
import { formatUsdc } from '@/lib/format'
import { Btn, CopyButton, GlassCard, HeroRings, IconBox, Notice, QrImage, Row, Screen, Spinner, glass } from '@/components/ui/kit'

const MAX_TRIES = 5

export function VaultSetup() {
  const { vault } = useApp()
  const { address } = useAccount()
  const [step, setStep] = useState<'intro' | 'confirm'>('intro')
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tries, setTries] = useState(0)

  const total = vault.fee !== null ? vault.fee + GAS_ESTIMATE_USDC6 : null
  const wallet = vault.walletBalance
  const enough = wallet !== null && total !== null && wallet >= total

  const sign = async () => {
    setSigning(true); setError(null)
    try { await vault.createVault() }
    catch (e) { setError(txErrorMessage(e)); setTries(t => t + 1) }
    finally { setSigning(false) }
  }

  if (step === 'confirm') {
    const out = tries >= MAX_TRIES
    return (
      <Screen>
        <GlassCard className="p-4 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <IconBox><Lock size={20} style={{ color: 'var(--accent)' }} /></IconBox>
            <p className="font-semibold text-[18px]" style={{ color: 'var(--ink)' }}>Confirm opening your vault</p>
          </div>
          <div className="overflow-hidden" style={{ border: '1px solid var(--border)', borderRadius: 16 }}>
            <Row label="Vault fee" value={formatUsdc(vault.fee, 6)} />
            <Row label="Estimated gas" value={`~${formatUsdc(GAS_ESTIMATE_USDC6)}`} />
            <Row label="Network" value={NET.name} />
            <Row label="Total" value={`~${formatUsdc(total, 6)}`} last />
          </div>
          <Notice tone="info">Your wallet asks you to sign once: the fee and the vault go in the same transaction.</Notice>
          <Notice tone="warning">The vault cannot be changed once created: only your wallet can withdraw, and withdrawals always go back to it.</Notice>
          {signing && <Spinner label="Waiting for confirmation in your wallet…" />}
          {error && !signing && (
            <Notice tone="danger" title="Transaction failed">
              {error} {out ? `Tried ${MAX_TRIES} times, pausing. Check your wallet, then reload the page to try again.` : `(Attempt ${tries}/${MAX_TRIES})`}
            </Notice>
          )}
        </GlassCard>
        <div className="flex gap-4">
          <Btn variant="outline" disabled={signing} onClick={() => { setStep('intro'); setError(null) }}>Cancel</Btn>
          <Btn loading={signing} disabled={out || !enough} onClick={() => { void sign() }}>{signing ? 'Signing…' : 'Sign and open vault'}</Btn>
        </div>
      </Screen>
    )
  }

  return (
    <Screen>
      <section className="p-4" style={glass.hero}>
        <HeroRings />
        <p className="text-[14px] font-semibold text-white mb-2">Wallet balance</p>
        <div className="flex items-baseline gap-2">
          <span className="display font-bold tabular-nums text-white" style={{ fontSize: 48, lineHeight: '56px' }}>
            {formatUsdc(wallet).replace(' USDC', '')}
          </span>
          <span className="text-[18px] font-medium text-white">USDC</span>
        </div>
      </section>

      <GlassCard className="p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <IconBox><Shield size={20} style={{ color: 'var(--accent)' }} /></IconBox>
          <div>
            <p className="font-semibold text-[18px]" style={{ color: 'var(--ink)' }}>Open your emergency fund vault</p>
            <p className="text-[14px]" style={{ color: 'var(--muted)' }}>Your own smart contract, only you can withdraw</p>
          </div>
        </div>
        <p className="text-[14px] leading-relaxed" style={{ color: 'var(--subtle)' }}>
          The vault is a separate smart contract on {NET.name}, apart from your wallet. Only your wallet address can withdraw.
        </p>

        {!FACTORY_CONFIGURED && <Notice tone="danger" title="No vault factory configured">This build has no factory address, so vaults cannot be opened yet.</Notice>}
        {vault.readError && wallet === null && <Notice tone="warning">Could not read your balance yet, the app will retry.</Notice>}

        {wallet !== null && total !== null && !enough && address && (
          <div className="p-4 flex flex-col gap-2" style={{ background: '#FDE8EB', border: '1px solid #FDE8EB', borderRadius: 16 }}>
            <p className="font-semibold text-[14px]" style={{ color: 'var(--danger)' }}>Not enough USDC to open the vault</p>
            <p className="text-[14px]" style={{ color: 'var(--danger)' }}>You need about {formatUsdc(total, 6)} (vault fee + gas)</p>
            <div className="flex flex-col items-center gap-2 pt-2">
              <QrImage value={address} />
              <p className="mono text-[14px] text-center break-all" style={{ color: 'var(--subtle)' }}>{address}</p>
              <CopyButton text={address} />
              {IS_MAINNET ? (
                <p className="text-[14px] text-center" style={{ color: 'var(--danger)' }}>Send USDC on Arc to this address, then come back. This is real money.</p>
              ) : (
                <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: 'var(--accent)' }}>
                  Get testnet USDC from the Circle Faucet <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>
        )}

        {enough && address && (
          <div className="px-4 py-4 flex items-center gap-2" style={{ background: '#E3F5EC', border: '1px solid #E3F5EC', borderRadius: 16 }}>
            <CheckCircle2 size={15} style={{ color: 'var(--success)' }} />
            <p className="font-semibold text-[14px]" style={{ color: 'var(--success)' }}>Wallet ready</p>
            <p className="mono text-[14px] ml-auto" style={{ color: 'var(--success)' }}>{address.slice(0, 8)}…{address.slice(-6)}</p>
          </div>
        )}
      </GlassCard>

      <Btn disabled={!enough || !FACTORY_CONFIGURED} onClick={() => setStep('confirm')}>Open vault</Btn>
    </Screen>
  )
}
