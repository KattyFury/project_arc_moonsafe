import { useState } from 'react'
import { Loader2, ShieldAlert, TrendingUp } from 'lucide-react'
import { useVault, formatUsdc, parseUsdcInput } from '@/hooks/useVault'
import { useFinancialProfile } from '@/hooks/useFinancialProfile'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useDisplayAmount } from '@/hooks/useDisplayAmount'
import { useAccount } from 'wagmi'

type FundTab = 'deposit' | 'withdraw'

const g = {
  card:  { background:'rgba(255,255,255,0.82)', backdropFilter:'blur(32px) saturate(180%)', WebkitBackdropFilter:'blur(32px) saturate(180%)', border:'1px solid var(--border)', borderRadius:20 },
  inner: { background:'rgba(255,255,255,0.96)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', border:'1px solid var(--border)', borderRadius:16 },
}

export function FundScreen({ onError: _onError }: { onError?: (m: string | null) => void }) {
  const { address } = useAccount()
  const { vaultBalance, walletUsdcBalance, deposit, withdraw, loading } = useVault()
  const { profile } = useFinancialProfile()
  const { vndToUsdc } = useExchangeRate()
  const { display, unit } = useDisplayAmount()
  const [tab, setTab] = useState<FundTab>('deposit')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [belowFloor, setBelowFloor] = useState(false)
  const [txSuccess, setTxSuccess] = useState(false)

  const floorMonths = profile?.incomeStable ? 3 : 6
  // monthlyExpenses stored in VND — convert to USDC 6-decimal bigint
  const monthlyExpensesVnd = profile?.monthlyExpenses ?? profile?.monthlyEssentials ?? 0
  const monthlyExpensesUsdc = vndToUsdc(monthlyExpensesVnd)  // bigint, 6-decimal
  const floorUsdc = monthlyExpensesUsdc * BigInt(floorMonths)
  const pct = floorUsdc > 0n ? Math.min(100, Number((vaultBalance * 100n) / floorUsdc)) : 0

  const setChip = (p: number | 'max') => {
    const max = tab === 'deposit' ? walletUsdcBalance : vaultBalance
    const v = p === 'max' ? max : (max * BigInt(p)) / 100n
    setAmount(formatUsdc(v))
  }

  const doAction = async (parsed: bigint) => {
    try {
      setError('')
      if (tab === 'deposit') await deposit(parsed)
      else await withdraw(parsed, address as `0x${string}`)
      setAmount('')
      setBelowFloor(false)
      setTxSuccess(true)
      setTimeout(() => setTxSuccess(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Giao dịch thất bại')
    }
  }

  const handleAction = async () => {
    setError('')
    const parsed = parseUsdcInput(amount)
    if (parsed <= 0n) { setError('Nhập số tiền hợp lệ'); return }
    if (tab === 'withdraw' && vaultBalance - parsed < floorUsdc && floorUsdc > 0n) {
      setBelowFloor(true); return
    }
    await doAction(parsed)
  }

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-5 flex flex-col gap-4" style={{ background:'var(--bg)' }}>

      {/* Hero balance card */}
      <section
        className="p-5 relative overflow-hidden"
        style={{ background:'linear-gradient(135deg,#0F3DB2 0%,#1E6DF7 100%)', borderRadius:24, boxShadow:'0 4px 24px rgba(30,109,247,0.35)' }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background:'rgba(255,255,255,0.18)' }}>
            <TrendingUp size={14} color="white" />
          </div>
          <span className="text-[13px] font-semibold text-white/70 tracking-wide">Quỹ dự phòng</span>
        </div>

        <div className="flex items-baseline gap-2 mb-1">
          <span className="display font-bold tabular-nums text-white" style={{ fontSize:40, lineHeight:1.1, letterSpacing:'-0.03em' }}>
            {display(vaultBalance, { unit: false })}
          </span>
          <span className="text-[18px] font-medium text-white/60">{unit}</span>
        </div>

        {floorUsdc > 0n && (
          <p className="text-[12px] text-white/50 mb-4">
            Sàn {floorMonths} tháng: {display(floorUsdc)}
          </p>
        )}

        {/* Progress bar */}
        {floorUsdc > 0n && (
          <>
            <div className="h-[6px] rounded-full mb-1" style={{ background:'rgba(255,255,255,0.18)' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width:`${pct}%`, background: pct >= 100 ? '#4ade80' : 'white' }}
              />
            </div>
            <div className="flex justify-between">
              <span className="text-[11px] text-white/50">{pct.toFixed(0)}%</span>
              <span className="text-[11px] text-white/50">{pct >= 100 ? 'Đủ sàn' : `Còn thiếu ${display(floorUsdc - vaultBalance)}`}</span>
            </div>
          </>
        )}

        {!profile?.monthlyExpenses && (
          <p className="text-[12px] text-white/50 mt-1">Chat với agent để khai báo chi tiêu</p>
        )}
      </section>

      {/* Action card */}
      <section style={g.card} className="overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor:'var(--border)' }}>
          {(['deposit','withdraw'] as FundTab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setAmount(''); setError('') }}
              className="flex-1 py-3.5 text-[15px] font-semibold transition-colors"
              style={{ color: tab===t ? 'var(--accent)' : 'var(--muted)', borderBottom: tab===t ? '2px solid var(--accent)' : '2px solid transparent' }}
            >
              {t === 'deposit' ? 'Nạp vào quỹ' : 'Rút về ví'}
            </button>
          ))}
        </div>

        <div className="p-4 flex flex-col gap-3">
          {/* Quick chips */}
          <div className="flex gap-2">
            {([25,50,'max'] as const).map(c => (
              <button
                key={c}
                onClick={() => setChip(c)}
                className="flex-1 py-2 text-[13px] font-semibold rounded-full transition-colors"
                style={{ background:'var(--surface-muted)', color:'var(--accent)', border:'1px solid var(--border)' }}
              >
                {c === 'max' ? 'Tối đa' : `${c}%`}
              </button>
            ))}
          </div>

          {/* Amount input */}
          <div
            className="flex items-center gap-3 px-4"
            style={{ ...g.inner, height:56, border: amount ? '2px solid var(--accent)' : '1px solid var(--border)' }}
          >
            <input
              inputMode="decimal"
              value={amount}
              onChange={e => { const v = e.target.value.replace(/[^0-9.]/g,''); if (v===''||/^\d*\.?\d*$/.test(v)) setAmount(v) }}
              placeholder="0.00"
              className="display flex-1 bg-transparent text-[28px] font-bold tabular-nums outline-none placeholder:opacity-20"
              style={{ color:'var(--ink)' }}
            />
            <span className="text-[15px] font-semibold" style={{ color:'var(--subtle)' }}>USDC</span>
          </div>

          <p className="text-[12px]" style={{ color:'var(--muted)' }}>
            {tab==='deposit'
              ? `Trong ví: ${display(walletUsdcBalance)}`
              : `Trong quỹ: ${display(vaultBalance)}`}
          </p>

          {txSuccess && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background:'rgba(15,157,88,0.08)' }}>
              <span className="text-[13px] font-semibold" style={{ color:'var(--success)' }}>Giao dịch thành công</span>
            </div>
          )}

          {error && (
            <p className="text-[12px] px-3 py-2 rounded-xl" style={{ color:'var(--danger)', background:'rgba(224,52,74,0.07)' }}>
              {error}
            </p>
          )}

          <button
            onClick={() => { void handleAction() }}
            disabled={loading || !amount || parseUsdcInput(amount) <= 0n}
            className="w-full rounded-2xl py-3.5 text-[15px] font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background:'var(--accent)', color:'white' }}
          >
            {loading
              ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Đang xử lý…</span>
              : tab === 'deposit' ? 'Nạp vào quỹ' : 'Rút về ví'
            }
          </button>
        </div>
      </section>

      {/* Below floor bottom sheet */}
      {belowFloor && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }}>
          <div
            className="w-full max-w-[430px] mx-auto p-5 pb-8 flex flex-col gap-4"
            style={{ background:'white', borderRadius:'24px 24px 0 0', boxShadow:'0 -8px 40px rgba(0,0,0,0.2)' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mb-1" style={{ background:'var(--border)' }} />
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background:'rgba(224,52,74,0.1)' }}>
                <ShieldAlert size={20} style={{ color:'var(--danger)' }} />
              </div>
              <div>
                <p className="font-semibold text-[17px]" style={{ color:'var(--ink)' }}>Rút dưới mức sàn</p>
                <p className="text-[14px] mt-1 leading-relaxed" style={{ color:'var(--subtle)' }}>
                  Số dư quỹ sẽ thấp hơn {floorMonths} tháng chi tiêu. Tính năng đầu tư sẽ bị khoá cho đến khi nạp đủ lại.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setBelowFloor(false)}
                className="flex-1 py-3.5 rounded-2xl text-[15px] font-semibold"
                style={{ border:'1.5px solid var(--border)', color:'var(--accent)' }}
              >
                Hủy
              </button>
              <button
                onClick={() => { void doAction(parseUsdcInput(amount)) }}
                className="flex-1 py-3.5 rounded-2xl text-[15px] font-semibold text-white"
                style={{ background:'var(--danger)' }}
              >
                Vẫn rút
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
