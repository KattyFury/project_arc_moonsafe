import { useState } from 'react'
import {
  Lock, TrendingUp, Loader2, AlertTriangle,
  CheckCircle2, XCircle, ArrowRight,
} from 'lucide-react'
import { useFinancialProfile } from '@/hooks/useFinancialProfile'
import { useSwap, INVEST_TOKENS, type InvestToken, type SwapQuote } from '@/hooks/useSwap'
import { useDisplayAmount } from '@/hooks/useDisplayAmount'
import { useVault, parseUsdcInput } from '@/hooks/useVault'

interface InvestScreenProps {
  locked: boolean
  floorUsdc: bigint
  vaultBalance: bigint
  onError?: (m: string | null) => void
}

const g = {
  card: { background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(32px) saturate(180%)', WebkitBackdropFilter: 'blur(32px) saturate(180%)', border: '1px solid var(--border)', borderRadius: 20 },
  inner: { background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--border)', borderRadius: 16 },
}

// Allocation plan: recommended % per token based on risk profile
interface AllocSlice { symbol: string; pct: number; color: string; icon: string; desc: string }

// Proper allocation plan: cirBTC (crypto core) + equities + altcoin risky bucket
function getAllocationPlan(risk: 'normal' | 'risky', maxPct: number): AllocSlice[] {
  const investable = maxPct
  const cash = 100 - investable

  if (risk === 'normal') {
    // Thận trọng: 60% đầu tư = 35% cirBTC + 20% chứng khoán quốc tế + 5% altcoin
    const btc   = Math.round(investable * 0.58)  // cirBTC — store of value
    const equit = Math.round(investable * 0.34)  // Chứng khoán — ETF/cổ phiếu
    const alt   = investable - btc - equit        // Altcoin — phần risky nhỏ
    return [
      { symbol: 'cirBTC',      pct: btc,   color: '#F7931A', icon: '₿', desc: 'cirBTC — Bitcoin trên Arc, kho lưu trữ giá trị dài hạn' },
      { symbol: 'Chứng khoán', pct: equit, color: '#1E6DF7', icon: '📈', desc: 'ETF / cổ phiếu quốc tế — tăng trưởng ổn định' },
      { symbol: 'Altcoin',     pct: alt,   color: '#A259FF', icon: '🔮', desc: 'Altcoin chọn lọc — rủi ro cao, tiềm năng lớn' },
      { symbol: 'Cash',        pct: cash,  color: '#CBD5E1', icon: '💵', desc: 'Tiền mặt / USDC — thanh khoản, quỹ cơ hội' },
    ]
  } else {
    // Mạo hiểm: tăng altcoin, giảm chứng khoán, giữ cirBTC làm neo
    const btc   = Math.round(investable * 0.45)  // cirBTC — neo danh mục
    const equit = Math.round(investable * 0.25)  // Chứng khoán — giảm xuống
    const alt   = investable - btc - equit        // Altcoin — tăng lên
    return [
      { symbol: 'cirBTC',      pct: btc,   color: '#F7931A', icon: '₿', desc: 'cirBTC — neo danh mục, tài sản dự trữ' },
      { symbol: 'Altcoin',     pct: alt,   color: '#A259FF', icon: '🔮', desc: 'Altcoin chọn lọc — rủi ro cao, tiềm năng cao' },
      { symbol: 'Chứng khoán', pct: equit, color: '#1E6DF7', icon: '📈', desc: 'ETF / cổ phiếu — đối trọng với crypto' },
      { symbol: 'Cash',        pct: cash,  color: '#CBD5E1', icon: '💵', desc: 'Tiền mặt / USDC — thanh khoản, quỹ cơ hội' },
    ]
  }
}

// SVG donut chart — pure SVG, no lib needed
function DonutChart({ slices }: { slices: AllocSlice[] }) {
  const r = 54
  const cx = 70
  const cy = 70
  const strokeW = 20
  const circumference = 2 * Math.PI * r

  const total = slices.reduce((s, sl) => s + sl.pct, 0)
  // Pre-compute cumulative offsets outside render to avoid mutation in map
  const offsets = slices.reduce<number[]>((acc, sl, i) => {
    acc.push(i === 0 ? 0 : (acc[i - 1] ?? 0) + (slices[i - 1]?.pct ?? 0))
    return acc
  }, [])

  return (
    <svg width={140} height={140} viewBox="0 0 140 140">
      {slices.map((sl, i) => {
        const dash = (sl.pct / total) * circumference
        const gap = circumference - dash
        const rotate = ((offsets[i] ?? 0) / total) * 360 - 90
        return (
          <circle
            key={sl.symbol}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={sl.color}
            strokeWidth={strokeW}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={0}
            transform={`rotate(${rotate} ${cx} ${cy})`}
          />
        )
      })}
      {/* Center label */}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="11" fill="var(--subtle)" fontFamily="DM Sans, system-ui">Phân bổ</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="13" fill="var(--ink)" fontWeight="700" fontFamily="DM Sans, system-ui">
        {slices.find(s => s.symbol !== 'Cash')?.pct ?? 0}% đầu tư
      </text>
    </svg>
  )
}

// Quote confirmation bottom sheet
function QuotePanel({
  q, token, onConfirm, onCancel, loading,
}: {
  q: SwapQuote; token: InvestToken; onConfirm: () => void; onCancel: () => void; loading: boolean
}) {
  const est = q.estimate
  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-[430px] mx-auto p-5 pb-8 flex flex-col gap-4" style={{ background: 'white', borderRadius: '24px 24px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.2)' }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-1" style={{ background: 'var(--border)' }} />
        <p className="font-bold text-[19px]" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Xác nhận swap</p>

        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
          <div className="text-center flex-1">
            <p className="font-bold text-[16px]" style={{ color: 'var(--ink)' }}>{q.amountIn} USDC</p>
            <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Bạn trả</p>
          </div>
          <ArrowRight size={18} style={{ color: 'var(--muted)' }} className="flex-shrink-0" />
          <div className="text-center flex-1">
            <p className="font-bold text-[16px]" style={{ color: 'var(--ink)' }}>{est.estimatedOutput?.amount ?? '~'} {token.symbol}</p>
            <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Bạn nhận</p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          {[
            { label: 'Slippage',  value: '3%' },
            { label: 'Router',    value: 'LiFi (bên thứ ba)' },
            { label: 'Phí ước tính', value: est.fees?.[0] ? `${est.fees[0].amount} ${est.fees[0].token}` : '~0.02%' },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between">
              <span className="text-[12px]" style={{ color: 'var(--muted)' }}>{label}</span>
              <span className="text-[12px] font-medium" style={{ color: 'var(--ink)' }}>{value}</span>
            </div>
          ))}
        </div>

        <div className="px-3 py-2 rounded-xl flex items-start gap-2" style={{ background: 'rgba(245,179,1,0.08)', border: '1px solid rgba(245,179,1,0.2)' }}>
          <AlertTriangle size={13} style={{ color: 'var(--yellow)', flexShrink: 0, marginTop: 1 }} />
          <p className="text-[11px] leading-relaxed" style={{ color: '#8A5F00' }}>
            Swap qua aggregator bên thứ ba (LiFi). Giá thực tế có thể khác ước tính. Chỉ đầu tư số tiền sẵn sàng mất.
          </p>
        </div>

        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3.5 rounded-2xl text-[15px] font-semibold" style={{ border: '1.5px solid var(--border)', color: 'var(--accent)' }}>Huỷ</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3.5 rounded-2xl text-[15px] font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {loading
              ? <span className="flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin" />Đang swap…</span>
              : `Mua ${token.symbol}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export function InvestScreen({ locked, floorUsdc, vaultBalance, onError: _onError }: InvestScreenProps) {
  const { profile } = useFinancialProfile()
  const { display } = useDisplayAmount()
  const { walletUsdcBalance } = useVault()
  const { quote, loading, error, txHash, estimateSwap, executeSwap, clearQuote } = useSwap()
  const [amount, setAmount] = useState('')
  const [selectedToken, setSelectedToken] = useState<InvestToken>(INVEST_TOKENS[0] ?? { symbol: 'WBTC', name: 'Wrapped Bitcoin', icon: '₿', decimals: 8, category: 'crypto' })
  const [risk, setRisk] = useState<'normal' | 'risky'>('normal')

  const age = profile?.age ?? 30
  const maxPct = risk === 'normal' ? Math.max(0, 110 - age) : Math.max(0, 120 - age)
  const shortfall = floorUsdc > vaultBalance ? floorUsdc - vaultBalance : 0n
  const noDebt = !profile?.hasExternalDebt
  const fundOk = vaultBalance >= floorUsdc && floorUsdc > 0n
  const allocationPlan = getAllocationPlan(risk, maxPct)

  const handleEstimate = async () => {
    const parsed = parseUsdcInput(amount)
    if (parsed <= 0n) return
    const amountStr = (Number(parsed) / 1_000_000).toFixed(2)
    await estimateSwap(selectedToken, amountStr)
  }

  if (locked) {
    return (
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-5 flex flex-col gap-4" style={{ background: 'var(--bg)' }}>
        <section style={g.card} className="p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(30,109,247,0.10)' }}>
              <Lock size={20} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <p className="font-semibold text-[17px]" style={{ color: 'var(--ink)' }}>Đầu tư đang khoá</p>
              <p className="text-[12px]" style={{ color: 'var(--muted)' }}>Cần đủ 2 điều kiện</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {[
              { ok: noDebt, label: 'Không có nợ ngoài' },
              { ok: fundOk, label: 'Quỹ dự phòng đủ sàn' },
            ].map(({ ok, label }) => (
              <div key={label} className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{ background: ok ? 'rgba(15,157,88,0.08)' : 'rgba(224,52,74,0.08)', border: `1px solid ${ok ? 'rgba(15,157,88,0.2)' : 'rgba(224,52,74,0.2)'}` }}>
                {ok
                  ? <CheckCircle2 size={18} style={{ color: 'var(--success)', flexShrink: 0 }} />
                  : <XCircle size={18} style={{ color: 'var(--danger)', flexShrink: 0 }} />}
                <span className="text-[14px] font-semibold" style={{ color: ok ? 'var(--success)' : 'var(--danger)' }}>{label}</span>
              </div>
            ))}
          </div>
          {shortfall > 0n && (
            <div className="px-4 py-3 rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
              <p className="text-[12px]" style={{ color: 'var(--subtle)' }}>Còn thiếu vào quỹ</p>
              <p className="display font-bold text-[22px] tabular-nums mt-0.5" style={{ color: 'var(--ink)' }}>{display(shortfall)}</p>
            </div>
          )}
        </section>
        <button disabled className="w-full rounded-2xl py-3.5 text-[15px] font-semibold flex items-center justify-center gap-2 opacity-40 cursor-not-allowed"
          style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
          <Lock size={15} />Đầu tư bị khoá
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-5 flex flex-col gap-4" style={{ background: 'var(--bg)' }}>

      {/* Portfolio hero */}
      <section className="p-5" style={{ background: 'linear-gradient(135deg,#0F3DB2 0%,#1E6DF7 100%)', borderRadius: 24, boxShadow: '0 4px 24px rgba(30,109,247,0.35)' }}>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={14} color="rgba(255,255,255,0.7)" />
          <span className="text-[13px] font-semibold text-white/70">Investment Hub</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] text-white/50 mb-1">Số dư trong ví</p>
            <p className="display font-bold tabular-nums text-white" style={{ fontSize: 28, letterSpacing: '-0.03em' }}>
              {display(walletUsdcBalance)}
            </p>
            <p className="text-[11px] text-white/40 mt-1">Trần đầu tư: {maxPct}% tài sản ngoài quỹ</p>
          </div>
          <div
            className="flex-shrink-0 flex gap-2"
            style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 24, padding: '6px 14px' }}
          >
            {(['normal', 'risky'] as const).map(r => (
              <button
                key={r}
                onClick={() => setRisk(r)}
                className="text-[12px] font-semibold px-2 py-1 rounded-full transition-all"
                style={{
                  background: risk === r ? 'white' : 'transparent',
                  color: risk === r ? 'var(--accent)' : 'rgba(255,255,255,0.6)',
                }}
              >
                {r === 'normal' ? 'Normal' : 'Risky'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Portfolio allocation plan */}
      <section style={g.card} className="p-5 flex flex-col gap-4">
        <p className="font-semibold text-[15px]" style={{ color: 'var(--ink)' }}>Kế hoạch phân bổ</p>
        <p className="text-[12px] mt-[-8px]" style={{ color: 'var(--muted)' }}>
          Tuổi {age} · {risk === 'normal' ? 'Thận trọng' : 'Mạo hiểm'} · Trần đầu tư {maxPct}%. Chứng khoán và altcoin mua ngoài app — chỉ mang tính tham khảo.
        </p>

        <div className="flex items-center gap-4">
          <DonutChart slices={allocationPlan} />
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            {allocationPlan.map(sl => (
              <div key={sl.symbol} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: sl.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>{sl.symbol}</span>
                    <span className="text-[13px] font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{sl.pct}%</span>
                  </div>
                  <p className="text-[10px] truncate" style={{ color: 'var(--muted)' }}>{sl.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Token selector */}
      <section style={g.card} className="p-4 flex flex-col gap-3">
        <p className="text-[12px] font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>Chọn tài sản để mua</p>
        <div className="flex flex-col gap-2">
          {INVEST_TOKENS.map(token => (
            <button
              key={token.symbol}
              onClick={() => setSelectedToken(token)}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl w-full text-left transition-all"
              style={{
                background: selectedToken.symbol === token.symbol ? 'rgba(30,109,247,0.08)' : 'var(--surface-muted)',
                border: `1.5px solid ${selectedToken.symbol === token.symbol ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-[18px] flex-shrink-0"
                style={{ background: selectedToken.symbol === token.symbol ? 'rgba(30,109,247,0.15)' : 'var(--border)' }}>
                {token.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[14px]" style={{ color: selectedToken.symbol === token.symbol ? 'var(--accent)' : 'var(--ink)' }}>{token.symbol}</p>
                <p className="text-[11px] truncate" style={{ color: 'var(--muted)' }}>{token.name}</p>
              </div>
              {/* Recommended badge based on plan */}
              {allocationPlan.find(s => s.symbol === token.symbol) && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: 'rgba(30,109,247,0.1)', color: 'var(--accent)' }}>
                  {allocationPlan.find(s => s.symbol === token.symbol)?.pct}%
                </span>
              )}
              {selectedToken.symbol === token.symbol && <CheckCircle2 size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
            </button>
          ))}
        </div>
      </section>

      {/* Amount input + swap */}
      <section style={g.card} className="p-4 flex flex-col gap-3">
        <p className="text-[12px] font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>Số tiền mua (USDC)</p>

        <div className="flex items-center gap-3 px-4"
          style={{ ...g.inner, height: 56, border: amount ? '2px solid var(--accent)' : '1px solid var(--border)' }}>
          <input
            inputMode="decimal"
            value={amount}
            onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v) }}
            placeholder="0.00"
            className="display flex-1 bg-transparent text-[28px] font-bold tabular-nums outline-none placeholder:opacity-20"
            style={{ color: 'var(--ink)' }}
          />
          <span className="text-[15px] font-semibold" style={{ color: 'var(--subtle)' }}>USDC</span>
        </div>

        <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
          Số dư ví: {display(walletUsdcBalance)}
        </p>

        <div className="px-3 py-2.5 rounded-xl flex items-start gap-2"
          style={{ background: 'rgba(245,179,1,0.08)', border: '1px solid rgba(245,179,1,0.2)' }}>
          <AlertTriangle size={13} style={{ color: 'var(--yellow)', flexShrink: 0, marginTop: 1 }} />
          <p className="text-[11px] leading-relaxed" style={{ color: '#8A5F00' }}>
            Giá {selectedToken.symbol} có thể giảm sâu. Chỉ đầu tư số tiền sẵn sàng mất. Đây là thông tin tham khảo, không phải tư vấn đầu tư.
          </p>
        </div>

        {txHash && (
          <div className="px-3 py-2.5 rounded-xl flex items-center gap-2"
            style={{ background: 'rgba(15,157,88,0.08)', border: '1px solid rgba(15,157,88,0.2)' }}>
            <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
            <p className="text-[12px] font-semibold" style={{ color: 'var(--success)' }}>
              Swap thành công · <span className="mono">{txHash.slice(0, 12)}…</span>
            </p>
          </div>
        )}

        {error && (
          <div className="px-3 py-2.5 rounded-xl flex items-start gap-2" style={{ background: 'rgba(224,52,74,0.07)' }}>
            <XCircle size={13} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
            <p className="text-[12px]" style={{ color: 'var(--danger)' }}>{error}</p>
          </div>
        )}

        <button
          onClick={() => { void handleEstimate() }}
          disabled={loading || !amount || parseUsdcInput(amount) <= 0n}
          className="w-full rounded-2xl py-3.5 text-[15px] font-semibold flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          {loading && !quote
            ? <><Loader2 size={16} className="animate-spin" />Đang lấy báo giá…</>
            : <>Xem báo giá · Mua {selectedToken.symbol}</>}
        </button>
      </section>

      {/* Quote confirmation sheet */}
      {quote && (
        <QuotePanel
          q={quote}
          token={selectedToken}
          loading={loading}
          onConfirm={() => { void executeSwap(quote, selectedToken) }}
          onCancel={clearQuote}
        />
      )}
    </div>
  )
}
