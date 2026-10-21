import { Copy, LogOut, Trash2, ChevronRight, Globe } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useVault } from '@/hooks/useVault'
import { useFinancialProfile } from '@/hooks/useFinancialProfile'
import { useLanguage, type AppLanguage } from '@/hooks/useLanguage'
import { useDisplayAmount } from '@/hooks/useDisplayAmount'
import { useState } from 'react'

interface SettingsScreenProps { onLogout: () => void }

const g = {
  card: { background:'rgba(255,255,255,0.82)', backdropFilter:'blur(32px) saturate(180%)', WebkitBackdropFilter:'blur(32px) saturate(180%)', border:'1px solid var(--border)', borderRadius:20 },
}

const LANGS: { value: AppLanguage; label: string; sub: string }[] = [
  { value: 'vi', label: '🇻🇳 Tiếng Việt', sub: 'Hiển thị số tiền bằng VND (₫)' },
  { value: 'en', label: '🇺🇸 English',    sub: 'Display amounts in USDC' },
]

export function SettingsScreen({ onLogout }: SettingsScreenProps) {
  const { address } = useAccount()
  const { walletUsdcBalance } = useVault()
  const { clearProfile } = useFinancialProfile()
  const { language, setLanguage } = useLanguage()
  const { display, unit } = useDisplayAmount()
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const copyAddress = async () => {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-5 flex flex-col gap-4" style={{ background:'var(--bg)' }}>
      <h2 className="display font-bold text-[22px]" style={{ color:'var(--ink)', letterSpacing:'-0.03em' }}>Ví & cài đặt</h2>

      {/* Wallet card */}
      <section style={g.card} className="overflow-hidden">
        <div className="px-5 py-4" style={{ borderBottom:'1px solid var(--border)' }}>
          <p className="text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color:'var(--muted)' }}>Địa chỉ ví</p>
          <div className="flex items-center justify-between gap-3">
            <p className="mono text-[13px] truncate" style={{ color:'var(--ink)' }}>
              {address ? `${address.slice(0,10)}…${address.slice(-8)}` : '–'}
            </p>
            <button
              onClick={() => { void copyAddress() }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-semibold flex-shrink-0 transition-colors"
              style={{ background: copied ? 'rgba(15,157,88,0.1)' : 'var(--surface-muted)', color: copied ? 'var(--success)' : 'var(--accent)', border:'1px solid var(--border)' }}
            >
              <Copy size={13} />
              {copied ? 'Đã sao chép' : 'Sao chép'}
            </button>
          </div>
        </div>

        <div className="px-5 py-4">
          <p className="text-[11px] font-semibold tracking-widest uppercase mb-1" style={{ color:'var(--muted)' }}>Số dư ví</p>
          <div className="flex items-baseline gap-2">
            <span className="display font-bold tabular-nums" style={{ fontSize:34, letterSpacing:'-0.03em', color:'var(--ink)' }}>
              {display(walletUsdcBalance, { unit: false })}
            </span>
            <span className="text-[16px]" style={{ color:'var(--subtle)' }}>{unit}</span>
          </div>
        </div>
      </section>

      {/* Language */}
      <section style={g.card} className="overflow-hidden">
        <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom:'1px solid var(--border)' }}>
          <Globe size={18} style={{ color:'var(--accent)' }} />
          <span className="text-[15px] font-semibold" style={{ color:'var(--ink)' }}>Ngôn ngữ / Language</span>
        </div>
        <div className="p-3 flex flex-col gap-2">
          {LANGS.map(l => (
            <button
              key={l.value}
              onClick={() => setLanguage(l.value)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all text-left"
              style={{
                background: language === l.value ? 'rgba(30,109,247,0.08)' : 'var(--surface-muted)',
                border: language === l.value ? '1.5px solid var(--accent)' : '1.5px solid transparent',
              }}
            >
              <div>
                <p className="text-[15px] font-semibold" style={{ color: language === l.value ? 'var(--accent)' : 'var(--ink)' }}>
                  {l.label}
                </p>
                <p className="text-[12px] mt-0.5" style={{ color:'var(--muted)' }}>{l.sub}</p>
              </div>
              {language === l.value && (
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background:'var(--accent)' }}
                >
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Actions */}
      <section style={g.card} className="overflow-hidden">
        <button
          onClick={() => setConfirm(true)}
          className="w-full flex items-center justify-between px-5 py-4 transition-colors active:bg-red-50"
          style={{ borderBottom:'1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <Trash2 size={18} style={{ color:'var(--danger)' }} />
            <span className="text-[15px] font-medium" style={{ color:'var(--danger)' }}>Xoá khai báo tài chính</span>
          </div>
          <ChevronRight size={16} style={{ color:'var(--muted)' }} />
        </button>

        <button
          onClick={onLogout}
          className="w-full flex items-center justify-between px-5 py-4 transition-colors active:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <LogOut size={18} style={{ color:'var(--subtle)' }} />
            <span className="text-[15px] font-medium" style={{ color:'var(--ink)' }}>Đăng xuất</span>
          </div>
          <ChevronRight size={16} style={{ color:'var(--muted)' }} />
        </button>
      </section>

      <p className="text-[11px] text-center mono" style={{ color:'var(--muted)', opacity:0.5 }}>
        MoonSafe · Arc Testnet · chain 5042002
      </p>

      {/* Confirm clear dialog */}
      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }}
        >
          <div
            className="w-full max-w-[430px] mx-auto p-5 pb-8 flex flex-col gap-4"
            style={{ background:'white', borderRadius:'24px 24px 0 0' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mb-1" style={{ background:'var(--border)' }} />
            <p className="font-semibold text-[17px]" style={{ color:'var(--ink)' }}>Xoá khai báo?</p>
            <p className="text-[14px] leading-relaxed" style={{ color:'var(--subtle)' }}>
              Toàn bộ thông tin tài chính và lịch sử chat sẽ bị xoá khỏi trình duyệt. Vault và USDC không bị ảnh hưởng.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(false)}
                className="flex-1 py-3.5 rounded-2xl text-[15px] font-semibold"
                style={{ border:'1.5px solid var(--border)', color:'var(--accent)' }}
              >
                Hủy
              </button>
              <button
                onClick={() => { clearProfile(); setConfirm(false) }}
                className="flex-1 py-3.5 rounded-2xl text-[15px] font-semibold text-white"
                style={{ background:'var(--danger)' }}
              >
                Xoá
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
