import { useFinancialProfile } from '@/hooks/useFinancialProfile'
import { useVault } from '@/hooks/useVault'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useDisplayAmount } from '@/hooks/useDisplayAmount'
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react'

const g = {
  card: { background:'rgba(255,255,255,0.82)', backdropFilter:'blur(32px) saturate(180%)', WebkitBackdropFilter:'blur(32px) saturate(180%)', border:'1px solid var(--border)', borderRadius:20 },
}

export function BalanceSheet({ onError: _onError }: { onError?: (m: string | null) => void }) {
  const { profile } = useFinancialProfile()
  const { vaultBalance, walletUsdcBalance } = useVault()
  const { vndToUsdc } = useExchangeRate()
  const { display } = useDisplayAmount()

  const hasProfile = !!profile?.monthlyExpenses

  const fmt = (usdc: bigint | undefined) => {
    if (usdc === undefined) return '–'
    return display(usdc)
  }
  // monthlyExpenses and monthlyIncome stored in VND — convert to USDC for calculations
  const expVnd = profile?.monthlyExpenses ?? profile?.monthlyEssentials ?? 0
  const incVnd = profile?.monthlyIncome ?? 0
  const monthlyExpUsdc = vndToUsdc(expVnd)   // bigint, 6-decimal
  const monthlyIncUsdc = vndToUsdc(incVnd)   // bigint, 6-decimal
  const otherBig = BigInt(Math.round((profile?.otherAssets ?? 0) * 1_000_000))
  const totalAssets = vaultBalance + walletUsdcBalance + otherBig
  const floorMonths = profile?.incomeStable ? 3 : 6
  const floorUsdc = monthlyExpUsdc * BigInt(floorMonths)
  const liquidityMonths = monthlyExpUsdc > 0n
    ? Number(vaultBalance) / Number(monthlyExpUsdc) : null
  const savingsRate = monthlyIncUsdc > 0n && monthlyExpUsdc > 0n
    ? (Number(monthlyIncUsdc - monthlyExpUsdc) / Number(monthlyIncUsdc)) * 100 : null

  type RowStatus = 'good' | 'warn' | 'bad' | undefined
  const rows: Array<{ label: string; value: string; sub?: string; status?: RowStatus }> = [
    { label: 'Giá trị ròng',   value: hasProfile ? fmt(totalAssets) : '–' },
    {
      label: 'Thanh khoản',
      value: liquidityMonths !== null ? `${liquidityMonths.toFixed(1)} tháng` : '–',
      sub: floorUsdc > 0n ? `Sàn: ${floorMonths} tháng` : undefined,
      status: liquidityMonths !== null ? (liquidityMonths >= floorMonths ? 'good' : 'bad') : undefined,
    },
    {
      label: 'Tỷ lệ tiết kiệm',
      value: savingsRate !== null ? `${savingsRate.toFixed(1)}%` : '–',
      status: savingsRate !== null ? (savingsRate >= 20 ? 'good' : savingsRate >= 10 ? 'warn' : 'bad') : undefined,
    },
    {
      label: 'Tài sản khác',
      value: profile?.otherAssets ? fmt(BigInt(Math.round(profile.otherAssets * 1_000_000))) : '–',
    },
    {
      label: 'Nợ ngoài',
      value: profile?.hasExternalDebt ? 'Có nợ' : 'Không có',
      status: profile?.hasExternalDebt ? 'bad' : 'good',
    },
  ]

  const StatusIcon = ({ s }: { s?: RowStatus }) => {
    if (s === 'good') return <CheckCircle2 size={16} style={{ color:'var(--success)' }} />
    if (s === 'bad')  return <XCircle size={16} style={{ color:'var(--danger)' }} />
    if (s === 'warn') return <AlertCircle size={16} style={{ color:'var(--yellow)' }} />
    return null
  }

  const valueColor = (s?: RowStatus) => {
    if (s === 'good') return 'var(--success)'
    if (s === 'bad')  return 'var(--danger)'
    if (s === 'warn') return 'var(--yellow)'
    return 'var(--ink)'
  }

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-5 flex flex-col gap-4" style={{ background:'var(--bg)' }}>

      {/* Header + unit toggle */}
      <div className="flex items-center justify-between">
        <h2 className="display font-bold text-[22px]" style={{ color:'var(--ink)', letterSpacing:'-0.03em' }}>Bảng cân đối</h2>
      </div>

      {!hasProfile && (
        <div
          className="p-4 rounded-2xl"
          style={{ background:'rgba(245,179,1,0.10)', border:'1px solid rgba(245,179,1,0.25)' }}
        >
          <p className="font-semibold text-[14px] mb-1" style={{ color:'#8A5F00' }}>Chưa có khai báo</p>
          <p className="text-[13px]" style={{ color:'#8A5F00' }}>Vào tab Chat để khai báo tài chính với agent.</p>
        </div>
      )}

      {/* Rows */}
      <section style={g.card} className="overflow-hidden">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: i < rows.length-1 ? '1px solid var(--border)' : 'none' }}
          >
            <div>
              <p className="text-[14px]" style={{ color:'var(--subtle)' }}>{row.label}</p>
              {row.sub && <p className="text-[11px] mt-0.5" style={{ color:'var(--muted)' }}>{row.sub}</p>}
            </div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-[15px] tabular-nums" style={{ color: valueColor(row.status) }}>{row.value}</p>
              <StatusIcon s={row.status} />
            </div>
          </div>
        ))}
      </section>

      {/* Vault + wallet balances */}
      <section style={g.card} className="overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:'1px solid var(--border)' }}>
          <p className="text-[14px]" style={{ color:'var(--subtle)' }}>Quỹ dự phòng</p>
          <p className="font-semibold text-[15px] tabular-nums" style={{ color:'var(--ink)' }}>{fmt(vaultBalance)}</p>
        </div>
        <div className="flex items-center justify-between px-5 py-4">
          <p className="text-[14px]" style={{ color:'var(--subtle)' }}>Số dư ví</p>
          <p className="font-semibold text-[15px] tabular-nums" style={{ color:'var(--ink)' }}>{fmt(walletUsdcBalance)}</p>
        </div>
      </section>
    </div>
  )
}
