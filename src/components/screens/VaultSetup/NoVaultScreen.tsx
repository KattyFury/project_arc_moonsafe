import { Copy, Shield, QrCode } from 'lucide-react'
import { formatUsdc } from '@/hooks/useVault'

interface NoVaultScreenProps {
  walletAddress: string
  walletUsdcBalance: bigint
  onOpenVault: () => void
}

const MIN_USDC = 1_010_000_000_000n // 1.01 USDC in native (12-decimal) units; handle both formats

export function NoVaultScreen({ walletAddress, walletUsdcBalance, onOpenVault }: NoVaultScreenProps) {
  // Support both 6-decimal ERC-20 and 12-decimal native representations
  const hasEnough = walletUsdcBalance >= 1_010_000n || walletUsdcBalance >= MIN_USDC

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-4" style={{ background:'var(--bg)' }}>
      {/* Balance hero */}
      <section
        className="p-5 relative overflow-hidden"
        style={{ background:'linear-gradient(135deg,#0F3DB2 0%,#1E6DF7 100%)', borderRadius:24, boxShadow:'0 4px 24px rgba(30,109,247,0.35)' }}
      >
        <p className="text-[13px] font-semibold text-white/70 mb-2">Số dư ví</p>
        <div className="flex items-baseline gap-2">
          <span className="display font-bold tabular-nums text-white" style={{ fontSize:40, lineHeight:1.1, letterSpacing:'-0.03em' }}>
            {formatUsdc(walletUsdcBalance)}
          </span>
          <span className="text-[18px] font-medium text-white/60">USDC</span>
        </div>
      </section>

      {/* Main card */}
      <section
        className="p-5 flex flex-col gap-4"
        style={{ background:'rgba(255,255,255,0.9)', backdropFilter:'blur(32px)', WebkitBackdropFilter:'blur(32px)', border:'1px solid var(--border)', borderRadius:20 }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 flex items-center justify-center flex-shrink-0"
            style={{ background:'rgba(30,109,247,0.10)', borderRadius:16 }}
          >
            <Shield size={20} style={{ color:'var(--accent)' }} />
          </div>
          <div>
            <p className="font-semibold text-[17px]" style={{ color:'var(--ink)' }}>Mở vault quỹ dự phòng</p>
            <p className="text-[12px]" style={{ color:'var(--muted)' }}>Smart contract riêng, chỉ bạn rút được</p>
          </div>
        </div>

        <p className="text-[14px] leading-relaxed" style={{ color:'var(--subtle)' }}>
          Vault là smart contract độc lập trên Arc Testnet, tách hoàn toàn khỏi ví. Chỉ địa chỉ ví của bạn mới có quyền rút tiền.
        </p>

        {!hasEnough && (
          <div
            className="p-4 flex flex-col gap-3"
            style={{ background:'rgba(224,52,74,0.06)', border:'1px solid rgba(224,52,74,0.2)', borderRadius:16 }}
          >
            <p className="font-semibold text-[14px]" style={{ color:'var(--danger)' }}>Chưa đủ USDC để mở vault</p>
            <p className="text-[12px]" style={{ color:'var(--danger)' }}>Cần ít nhất 1.01 USDC (phí 1 USDC + gas ~0.01)</p>
            <div className="flex flex-col items-center gap-3 pt-1">
              <div
                className="w-32 h-32 flex items-center justify-center"
                style={{ background:'var(--surface-muted)', borderRadius:12 }}
              >
                <QrCode size={64} style={{ color:'var(--muted)' }} />
              </div>
              <p className="mono text-[11px] text-center break-all" style={{ color:'var(--subtle)' }}>{walletAddress}</p>
              <button
                onClick={() => { void navigator.clipboard.writeText(walletAddress) }}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold transition-colors"
                style={{ background:'var(--surface-muted)', color:'var(--accent)', border:'1px solid var(--border)' }}
              >
                <Copy size={14} />
                Sao chép địa chỉ
              </button>
            </div>
          </div>
        )}

        {hasEnough && (
          <div
            className="px-4 py-3"
            style={{ background:'rgba(15,157,88,0.07)', border:'1px solid rgba(15,157,88,0.2)', borderRadius:14 }}
          >
            <p className="font-semibold text-[14px]" style={{ color:'var(--success)' }}>Ví sẵn sàng</p>
            <p className="mono text-[12px] mt-0.5" style={{ color:'var(--success)' }}>
              {walletAddress.slice(0,8)}…{walletAddress.slice(-6)}
            </p>
          </div>
        )}
      </section>

      <button
        onClick={onOpenVault}
        disabled={!hasEnough}
        className="w-full rounded-2xl py-4 text-[15px] font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: hasEnough ? 'var(--accent)' : 'var(--surface-muted)', color: hasEnough ? 'white' : 'var(--muted)', boxShadow: hasEnough ? '0 4px 16px rgba(30,109,247,0.35)' : 'none' }}
      >
        Mở vault
      </button>
    </div>
  )
}
