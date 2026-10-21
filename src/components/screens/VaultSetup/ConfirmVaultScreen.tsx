import { useState } from 'react'
import { Loader2, AlertCircle, Lock, CheckCircle2 } from 'lucide-react'

interface ConfirmVaultScreenProps {
  onConfirm: () => Promise<void>
  onCancel: () => void
}

const rows = [
  { label: 'Phí mở vault',     value: '1 USDC' },
  { label: 'Gas ước tính',     value: '~0.01 USDC' },
  { label: 'Mạng',             value: 'Arc Testnet' },
  { label: 'Tổng',             value: '~1.01 USDC', bold: true },
]

export function ConfirmVaultScreen({ onConfirm, onCancel }: ConfirmVaultScreenProps) {
  const [status, setStatus] = useState<'idle' | 'waiting' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [retries, setRetries] = useState(0)
  const MAX = 5

  const handleSign = async () => {
    if (retries >= MAX) return
    setStatus('waiting')
    setErrorMsg('')
    try { await onConfirm() }
    catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Có lỗi xảy ra')
      setStatus('error')
      setRetries(r => r + 1)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-4" style={{ background:'var(--bg)' }}>
      <section
        className="p-5 flex flex-col gap-4"
        style={{ background:'rgba(255,255,255,0.9)', backdropFilter:'blur(32px)', WebkitBackdropFilter:'blur(32px)', border:'1px solid var(--border)', borderRadius:20 }}
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 flex items-center justify-center flex-shrink-0" style={{ background:'rgba(30,109,247,0.10)', borderRadius:16 }}>
            <Lock size={20} style={{ color:'var(--accent)' }} />
          </div>
          <p className="font-semibold text-[17px]" style={{ color:'var(--ink)' }}>Xác nhận mở vault</p>
        </div>

        {/* Fee rows */}
        <div className="overflow-hidden" style={{ border:'1px solid var(--border)', borderRadius:16 }}>
          {rows.map((r, i) => (
            <div
              key={r.label}
              className="flex justify-between items-center px-4 py-3"
              style={{ borderBottom: i < rows.length-1 ? '1px solid var(--border)' : 'none', background: r.bold ? 'rgba(30,109,247,0.03)' : 'transparent' }}
            >
              <span className="text-[14px]" style={{ color:'var(--subtle)' }}>{r.label}</span>
              <span className="text-[14px]" style={{ fontWeight: r.bold ? 700 : 500, color:'var(--ink)' }}>{r.value}</span>
            </div>
          ))}
        </div>

        {/* Single signature info */}
        <div
          className="px-4 py-3 flex items-start gap-2"
          style={{ background:'rgba(30,109,247,0.06)', border:'1px solid rgba(30,109,247,0.15)', borderRadius:14 }}
        >
          <CheckCircle2 size={15} style={{ color:'var(--accent)', flexShrink:0, marginTop:2 }} />
          <p className="text-[13px] leading-relaxed" style={{ color:'var(--accent-dark)' }}>
            Ví sẽ yêu cầu ký 1 lần — phí và vault được tạo trong cùng giao dịch.
          </p>
        </div>

        {/* Immutable */}
        <div
          className="px-4 py-3 flex items-start gap-2"
          style={{ background:'rgba(245,179,1,0.07)', border:'1px solid rgba(245,179,1,0.2)', borderRadius:14 }}
        >
          <CheckCircle2 size={15} style={{ color:'#F5B301', flexShrink:0, marginTop:2 }} />
          <p className="text-[13px] leading-relaxed" style={{ color:'#8A5F00' }}>
            Vault bất biến sau khi tạo — chỉ ví của bạn mới rút được.
          </p>
        </div>

        {status === 'waiting' && (
          <div className="flex items-center gap-2" style={{ color:'var(--accent)' }}>
            <Loader2 size={16} className="animate-spin flex-shrink-0" />
            <span className="text-[14px] font-semibold">Đang chờ xác nhận trong ví…</span>
          </div>
        )}

        {status === 'error' && (
          <div
            className="px-4 py-3 flex items-start gap-2"
            style={{ background:'rgba(224,52,74,0.07)', border:'1px solid rgba(224,52,74,0.2)', borderRadius:14 }}
          >
            <AlertCircle size={16} style={{ color:'var(--danger)', flexShrink:0, marginTop:2 }} />
            <div>
              <p className="text-[14px] font-semibold" style={{ color:'var(--danger)' }}>Giao dịch thất bại</p>
              <p className="text-[12px] mt-0.5" style={{ color:'var(--danger)' }}>{errorMsg}</p>
              {retries >= MAX && (
                <p className="text-[12px] mt-1 font-semibold" style={{ color:'var(--danger)' }}>
                  Đã thử {MAX} lần. Vui lòng thử lại sau.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          disabled={status === 'waiting'}
          className="flex-1 py-3.5 rounded-2xl text-[15px] font-semibold transition-all disabled:opacity-40"
          style={{ border:'1.5px solid var(--border)', color:'var(--accent)' }}
        >
          Hủy
        </button>
        <button
          onClick={() => { void handleSign() }}
          disabled={status === 'waiting' || retries >= MAX}
          className="flex-1 py-3.5 rounded-2xl text-[15px] font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background:'var(--accent)', boxShadow:'0 4px 16px rgba(30,109,247,0.35)' }}
        >
          {status === 'waiting'
            ? <span className="flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin" /> Đang ký…</span>
            : 'Ký và mở vault'
          }
        </button>
      </div>
    </div>
  )
}
