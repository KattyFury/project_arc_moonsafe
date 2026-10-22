// UI pieces in the original Arc Studio look (glass cards, blue hero gradient,
// rounded-2xl buttons, DM Sans / Space Grotesk). Disabled states use muted colors
// instead of opacity.

import { useEffect, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Copy, Info, Loader2 } from 'lucide-react'
import QRCode from 'qrcode'
import clsx from 'clsx'
import { cleanUsdcInput, parseVndInput } from '@/lib/format'

export const glass = {
  card: { background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(32px) saturate(180%)', WebkitBackdropFilter: 'blur(32px) saturate(180%)', border: '1px solid var(--border)', borderRadius: 20 } as CSSProperties,
  inner: { background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--border)', borderRadius: 16 } as CSSProperties,
  hero: { background: 'linear-gradient(135deg,#0F3DB2 0%,#1E6DF7 100%)', borderRadius: 24, boxShadow: '0 4px 24px rgba(30,109,247,0.35)' } as CSSProperties,
}

export function Screen({ children }: { children: ReactNode }) {
  return <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-5 flex flex-col gap-4" style={{ background: 'var(--bg)' }}>{children}</div>
}

export function Title({ children }: { children: ReactNode }) {
  return <h2 className="display font-bold text-[22px]" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>{children}</h2>
}

export function GlassCard({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <section className={clsx('overflow-hidden', className)} style={{ ...glass.card, ...style }}>{children}</section>
}

type BtnVariant = 'primary' | 'outline' | 'danger'

export function Btn({ variant = 'primary', loading, className, children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean }) {
  const off = disabled || loading
  const style: CSSProperties = off && variant !== 'outline'
    ? { background: 'var(--surface-muted)', color: 'var(--muted)' }
    : variant === 'primary' ? { background: 'var(--accent)', color: 'white', boxShadow: '0 4px 16px rgba(30,109,247,0.35)' }
    : variant === 'danger' ? { background: 'var(--danger)', color: 'white' }
    : { border: '1.5px solid var(--border)', color: off ? 'var(--muted)' : 'var(--accent)' }
  return (
    <button {...rest} disabled={off} style={style}
      className={clsx('w-full rounded-2xl py-3.5 text-[15px] font-semibold transition-all flex items-center justify-center gap-2',
        !off && 'hover:scale-[1.01] active:scale-[0.99]', off && 'cursor-not-allowed', className)}>
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  )
}

const NOTICE = {
  info:    { Icon: Info,          bg: 'rgba(30,109,247,0.06)', border: 'rgba(30,109,247,0.15)', color: 'var(--accent-dark)' },
  success: { Icon: CheckCircle2,  bg: 'rgba(15,157,88,0.07)',  border: 'rgba(15,157,88,0.2)',  color: 'var(--success)' },
  warning: { Icon: AlertTriangle, bg: 'rgba(245,179,1,0.08)',  border: 'rgba(245,179,1,0.2)',  color: '#8A5F00' },
  danger:  { Icon: AlertCircle,   bg: 'rgba(224,52,74,0.07)',  border: 'rgba(224,52,74,0.2)',  color: 'var(--danger)' },
} as const

export function Notice({ tone, title, children }: { tone: keyof typeof NOTICE; title?: string; children?: ReactNode }) {
  const n = NOTICE[tone]
  return (
    <div className="px-4 py-3 flex items-start gap-2" style={{ background: n.bg, border: `1px solid ${n.border}`, borderRadius: 14 }}>
      <n.Icon size={15} style={{ color: n.color, flexShrink: 0, marginTop: 2 }} />
      <div className="min-w-0">
        {title && <p className="text-[14px] font-semibold" style={{ color: n.color }}>{title}</p>}
        {children && <div className="text-[13px] leading-relaxed" style={{ color: n.color }}>{children}</div>}
      </div>
    </div>
  )
}

export function Row({ label, sub, value, color, last }: { label: string; sub?: string; value: ReactNode; color?: string; last?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <div className="min-w-0">
        <p className="text-[14px]" style={{ color: 'var(--subtle)' }}>{label}</p>
        {sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>{sub}</p>}
      </div>
      <div className="font-semibold text-[15px] tabular-nums text-right" style={{ color: color ?? 'var(--ink)' }}>{value}</div>
    </div>
  )
}

export function Chips({ items }: { items: { label: string; onClick: () => void; disabled?: boolean }[] }) {
  return (
    <div className="flex gap-2">
      {items.map(c => (
        <button key={c.label} onClick={c.onClick} disabled={c.disabled}
          className="flex-1 py-2 text-[13px] font-semibold rounded-full transition-colors"
          style={{ background: 'var(--surface-muted)', color: c.disabled ? 'var(--muted)' : 'var(--accent)', border: '1px solid var(--border)' }}>
          {c.label}
        </button>
      ))}
    </div>
  )
}

/** Big USDC amount field. Value is the cleaned string ("1234,5"). */
export function AmountField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4"
      style={{ ...glass.inner, height: 56, border: value ? '2px solid var(--accent)' : '1px solid var(--border)' }}>
      <input inputMode="decimal" value={value} disabled={disabled} placeholder="0"
        onChange={e => onChange(cleanUsdcInput(e.target.value))}
        className="display flex-1 min-w-0 bg-transparent text-[28px] font-bold tabular-nums outline-none placeholder:opacity-20"
        style={{ color: 'var(--ink)' }} />
      <span className="text-[15px] font-semibold" style={{ color: 'var(--subtle)' }}>USDC</span>
    </div>
  )
}

const fieldStyle: CSSProperties = { background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: 14, height: 44 }

export function VndField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const shown = value === null ? '' : new Intl.NumberFormat('vi-VN').format(value)
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-semibold" style={{ color: 'var(--subtle)' }}>{label}</span>
      <div className="flex items-center gap-2 px-3" style={fieldStyle}>
        <input inputMode="numeric" value={shown} placeholder="0" onChange={e => onChange(parseVndInput(e.target.value))}
          className="flex-1 min-w-0 bg-transparent outline-none text-[15px] tabular-nums" style={{ color: 'var(--ink)' }} />
        <span className="text-[13px]" style={{ color: 'var(--muted)' }}>₫</span>
      </div>
    </label>
  )
}

export function NumField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-semibold" style={{ color: 'var(--subtle)' }}>{label}</span>
      <div className="flex items-center px-3" style={fieldStyle}>
        <input inputMode="numeric" value={value ?? ''} placeholder="–"
          onChange={e => { const d = e.target.value.replace(/\D/g, '').slice(0, 3); onChange(d ? Number(d) : null) }}
          className="flex-1 min-w-0 bg-transparent outline-none text-[15px] tabular-nums" style={{ color: 'var(--ink)' }} />
      </div>
    </label>
  )
}

/** Two-option pill toggle. */
export function Toggle<T extends string>({ value, options, onChange }: { value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className="flex-1 py-2 rounded-xl text-[13px] font-semibold transition-all"
          style={value === o.value ? { background: 'white', color: 'var(--accent)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } : { color: 'var(--subtle)' }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Bottom sheet over a dim backdrop. */
export function Sheet({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-[430px] mx-auto p-5 pb-8 flex flex-col gap-4"
        style={{ background: 'white', borderRadius: '24px 24px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.2)' }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-1" style={{ background: 'var(--border)' }} />
        {children}
      </div>
    </div>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2" style={{ color: 'var(--accent)' }}>
      <Loader2 size={16} className="animate-spin flex-shrink-0" />
      <span className="text-[14px] font-semibold">{label}</span>
    </div>
  )
}

export function QrImage({ value, size = 184 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(value, { width: size * 2, margin: 1 })
      .then(u => { if (alive) setSrc(u) })
      .catch(() => { if (alive) setSrc(null) })
    return () => { alive = false }
  }, [value, size])
  return (
    <div className="p-2 bg-white" style={{ width: size, height: size, borderRadius: 12, border: '1px solid var(--border)' }}>
      {src && <img src={src} alt="Mã QR địa chỉ ví" className="w-full h-full" />}
    </div>
  )
}

export function CopyButton({ text, label = 'Sao chép địa chỉ' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 2000) }) }}
      className="flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold transition-colors"
      style={{ background: done ? 'rgba(15,157,88,0.1)' : 'var(--surface-muted)', color: done ? 'var(--success)' : 'var(--accent)', border: '1px solid var(--border)' }}>
      <Copy size={14} />
      {done ? 'Đã sao chép' : label}
    </button>
  )
}

export function IconBox({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'yellow' | 'red' }) {
  const bg = tone === 'blue' ? 'rgba(30,109,247,0.10)' : tone === 'yellow' ? 'rgba(245,179,1,0.12)' : 'rgba(224,52,74,0.1)'
  return <div className="w-11 h-11 flex items-center justify-center flex-shrink-0" style={{ background: bg, borderRadius: 16 }}>{children}</div>
}
