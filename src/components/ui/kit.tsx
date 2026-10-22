// UI primitives — nguyen0xhieu design system (brand/README.md):
// buttons 48 high / padding 24 / app-button 22, radius 16, shadow-y2 on floating
// things, disabled = line fill + muted text (never opacity), spacing in 8s.

import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle, type LucideIcon } from 'lucide-react'
import QRCode from 'qrcode'
import clsx from 'clsx'
import { cleanUsdcInput, parseVndInput } from '@/lib/format'

type BtnVariant = 'primary' | 'secondary' | 'danger'

export function Button({
  variant = 'primary', size = 'md', block = false, loading = false, icon: Icon, className, children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant; size?: 'md' | 'sm'; block?: boolean; loading?: boolean; icon?: LucideIcon
}) {
  const off = disabled || loading
  return (
    <button
      {...rest}
      disabled={off}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-md select-none transition-colors',
        size === 'md' ? 'h-12 px-6 text-app-button' : 'h-10 px-4 text-app-btn-sm rounded-pill',
        block ? 'w-full' : size === 'md' && 'w-[296px] max-w-full',
        off
          ? 'bg-line text-muted cursor-not-allowed'
          : variant === 'primary' ? 'bg-blue text-on-blue shadow-y2 active:bg-blue-strong'
          : variant === 'danger' ? 'bg-red text-on-blue shadow-y2'
          : 'bg-ground text-blue shadow-y2',
        className,
      )}
    >
      {loading ? <Loader2 size={24} className="animate-spin" /> : Icon ? <Icon size={size === 'md' ? 24 : 20} /> : null}
      {children}
    </button>
  )
}

export function IconButton({ icon: Icon, label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button {...rest} aria-label={label} title={label}
      className={clsx('w-12 h-12 shrink-0 inline-flex items-center justify-center rounded-md text-grey', className)}>
      <Icon size={24} />
    </button>
  )
}

/** Floating card (ground + shadow) or flat box (mist). */
export function Card({ flat = false, className, children }: { flat?: boolean; className?: string; children: ReactNode }) {
  return (
    <section className={clsx('rounded-md p-4 flex flex-col gap-2', flat ? 'bg-mist' : 'bg-ground shadow-y2', className)}>
      {children}
    </section>
  )
}

const NOTICE = {
  info:    { Icon: Info,          box: 'bg-blue-soft',   text: 'text-blue-strong' },
  success: { Icon: CheckCircle2,  box: 'bg-green-soft',  text: 'text-green-text' },
  warning: { Icon: AlertTriangle, box: 'bg-yellow-soft', text: 'text-yellow-text' },
  danger:  { Icon: XCircle,       box: 'bg-red-soft',    text: 'text-red-text' },
} as const

export function Notice({ tone, title, children }: { tone: keyof typeof NOTICE; title?: string; children?: ReactNode }) {
  const { Icon, box, text } = NOTICE[tone]
  return (
    <div className={clsx('rounded-md px-4 py-3 flex gap-2 items-start', box, text)} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon size={20} className="shrink-0 mt-[2px]" />
      <div className="flex flex-col gap-1 min-w-0">
        {title && <p className="text-app-btn-sm">{title}</p>}
        {children && <div className="text-app-note">{children}</div>}
      </div>
    </div>
  )
}

/** "Label ........ value" list row, min height 56. */
export function Row({ label, sub, value, valueClass, last = false }: { label: string; sub?: string; value: ReactNode; valueClass?: string; last?: boolean }) {
  return (
    <div className={clsx('min-h-14 py-2 flex items-center justify-between gap-4', !last && 'border-b border-line')}>
      <div className="min-w-0">
        <p className="text-app-secondary text-grey">{label}</p>
        {sub && <p className="text-app-caption text-muted">{sub}</p>}
      </div>
      <div className={clsx('text-app-btn-sm tabular text-right', valueClass ?? 'text-ink')}>{value}</div>
    </div>
  )
}

export function Progress({ pct, tone = 'blue' }: { pct: number | null; tone?: 'blue' | 'green' | 'on-blue' }) {
  const w = pct === null ? 0 : Math.max(0, Math.min(100, pct))
  return (
    <div className={clsx('h-2 rounded-pill overflow-hidden', tone === 'on-blue' ? 'bg-[rgba(255,255,255,0.32)]' : 'bg-line')}
      role="progressbar" aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100}>
      <div className={clsx('h-full rounded-pill transition-[width] duration-500',
        tone === 'on-blue' ? 'bg-on-blue' : tone === 'green' ? 'bg-green' : 'bg-blue')} style={{ width: `${w}%` }} />
    </div>
  )
}

/** Segmented tabs (Nạp / Rút, Normal / Risky). */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-2 p-1 rounded-md bg-mist" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={clsx('h-10 rounded-md text-app-btn-sm', value === o.value ? 'bg-ground text-blue shadow-y2' : 'text-grey')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Chips({ items }: { items: { label: string; onClick: () => void; disabled?: boolean }[] }) {
  return (
    <div className="flex gap-2">
      {items.map(c => (
        <button key={c.label} onClick={c.onClick} disabled={c.disabled}
          className={clsx('flex-1 h-10 rounded-pill text-app-btn-sm', c.disabled ? 'bg-line text-muted' : 'bg-blue-soft text-blue-strong')}>
          {c.label}
        </button>
      ))}
    </div>
  )
}

const inputBox = 'h-12 px-4 rounded-md bg-mist border flex items-center gap-2 focus-within:border-2 focus-within:border-blue'

/** USDC amount input. Value is the cleaned string ("1234,5"). */
export function UsdcInput({ value, onChange, label, disabled }: { value: string; onChange: (v: string) => void; label?: string; disabled?: boolean }) {
  return (
    <label className="flex flex-col gap-2">
      {label && <span className="text-app-label text-grey">{label}</span>}
      <div className={clsx(inputBox, 'border-line')}>
        <input inputMode="decimal" value={value} disabled={disabled} placeholder="0"
          onChange={e => onChange(cleanUsdcInput(e.target.value))}
          className="flex-1 min-w-0 bg-transparent outline-none text-app-body tabular text-ink placeholder:text-muted" />
        <span className="text-app-secondary text-grey">USDC</span>
      </div>
    </label>
  )
}

/** VND input with live thousand dots. */
export function VndInput({ value, onChange, label, placeholder }: { value: number | null; onChange: (v: number | null) => void; label: string; placeholder?: string }) {
  const shown = value === null ? '' : new Intl.NumberFormat('vi-VN').format(value)
  return (
    <label className="flex flex-col gap-1">
      <span className="text-app-label text-grey">{label}</span>
      <div className={clsx(inputBox, 'border-line')}>
        <input inputMode="numeric" value={shown} placeholder={placeholder ?? '0'}
          onChange={e => onChange(parseVndInput(e.target.value))}
          className="flex-1 min-w-0 bg-transparent outline-none text-app-secondary tabular text-ink placeholder:text-muted" />
        <span className="text-app-note text-grey">₫</span>
      </div>
    </label>
  )
}

export function NumberInput({ value, onChange, label, suffix }: { value: number | null; onChange: (v: number | null) => void; label: string; suffix?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-app-label text-grey">{label}</span>
      <div className={clsx(inputBox, 'border-line')}>
        <input inputMode="numeric" value={value ?? ''} placeholder="–"
          onChange={e => { const d = e.target.value.replace(/\D/g, '').slice(0, 3); onChange(d ? Number(d) : null) }}
          className="flex-1 min-w-0 bg-transparent outline-none text-app-secondary tabular text-ink placeholder:text-muted" />
        {suffix && <span className="text-app-note text-grey">{suffix}</span>}
      </div>
    </label>
  )
}

/** Centered popup on a scrim. */
export function Modal({ title, onClose, children, width = 312 }: { title: string; onClose?: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!onClose) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 bg-scrim flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}
        className="bg-ground rounded-md shadow-y2 p-4 flex flex-col gap-4 max-h-full overflow-y-auto" style={{ width, maxWidth: '100%' }}>
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-app-title-card text-ink">{title}</h2>
          {onClose && <IconButton icon={X} label="Đóng" onClick={onClose} className="-mt-3 -mr-3" />}
        </div>
        {children}
      </div>
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-blue-strong">
      <Loader2 size={24} className="animate-spin shrink-0" />
      {label && <span className="text-app-secondary">{label}</span>}
    </div>
  )
}

export function QrImage({ value, size = 184 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(value, { width: size * 2, margin: 1, color: { dark: '#000000', light: '#FFFFFF' } })
      .then(u => { if (alive) setSrc(u) })
      .catch(() => { if (alive) setSrc(null) })
    return () => { alive = false }
  }, [value, size])
  return (
    <div className="rounded-md bg-[#FFFFFF] p-2 shadow-y2" style={{ width: size, height: size }}>
      {src && <img src={src} alt="Mã QR địa chỉ ví" className="w-full h-full" />}
    </div>
  )
}

export function CopyButton({ text, label = 'Sao chép địa chỉ' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button variant="secondary" size="sm" icon={done ? CheckCircle2 : undefined}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 2000) })
      }}>
      {done ? 'Đã sao chép' : label}
    </Button>
  )
}
