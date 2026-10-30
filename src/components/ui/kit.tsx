// UI pieces built to the MoonSafe Figma (WcPHEwY8xh33OvCFrxgLcQ, sections "Mobile web 393"
// and "Desktop web 1440") with the nguyen0xhieu design system: ground/mist surfaces,
// 0x Blue, radius 16, shadow Y2, Apple system font, Web / Web Mobile type styles.
// Disabled states use the line/muted colors instead of opacity.

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Copy, Info, Loader2, ChevronDown } from 'lucide-react'
import QRCode from 'qrcode'
import clsx from 'clsx'
import { cleanUsdcInput } from '@/lib/format'

export const glass = {
  card: { background: 'var(--bg)', borderRadius: 20, border: '1px solid var(--line)' } as CSSProperties,
  // The main figure of a screen (direction 1, 2026-10-30): a flat Blue Soft panel, dark text, no gradient.
  hero: { background: 'var(--accent-soft)', borderRadius: 20 } as CSSProperties,
}


/** A 6-decimal amount that counts up from 0 when it first shows (and on later changes, from the last value). */
export function CountUp({ value, format }: { value: bigint; format: (v: bigint) => string }) {
  const [shown, setShown] = useState<bigint>(0n)
  const last = useRef(0n)
  useEffect(() => {
    const from = last.current, start = performance.now()
    const ms = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 800
    let raf = 0
    const step = (t: number) => {
      const k = ms ? Math.min(1, (t - start) / ms) : 1, e = 1 - Math.pow(1 - k, 3)
      last.current = from + ((value - from) * BigInt(Math.round(e * 1000))) / 1000n
      setShown(last.current)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{format(shown)}</>
}

/**
 * Logo + "MoonSafe" lockup (Figma node 32:367): the logo is 1.5x the type size, shown as
 * the full blue circle, never inside a white box (the boxed version is only the X profile picture).
 */
export function Wordmark({ size, color = 'var(--accent)' }: { size: number; color?: string }) {
  const logo = Math.round(size * 1.5)
  return (
    <span className="inline-flex items-center flex-shrink-0" style={{ gap: Math.round(logo * 6 / 80) }}>
      <img src="/logo.svg" alt="" width={logo} height={logo} />
      <span className="display font-bold" style={{ fontSize: size, lineHeight: `${logo}px`, color }}>MoonSafe</span>
    </span>
  )
}

/**
 * Scrolling page. Mobile: 16 margins. Desktop: content 1200 wide (Grid/Website 1440:
 * 12 columns, gutter 24), 48 from the nav, 64 at the bottom (2026-10-30: 96 pushed Balance 2px past 900).
 */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto no-scrollbar" style={{ background: 'var(--page)' }}>
      {/* Children never shrink: a long screen scrolls instead of clipping its cards. */}
      <div className="w-full max-w-[1248px] mx-auto px-4 py-4 flex flex-col gap-4 lg:px-6 lg:pt-12 lg:pb-16 lg:gap-6 [&>*]:flex-shrink-0">
        {children}
      </div>
    </div>
  )
}

/** One column on mobile, the 12-column grid on desktop. */
export function Grid({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">{children}</div>
}

const SPAN = { 4: 'lg:col-span-4', 5: 'lg:col-span-5', 6: 'lg:col-span-6', 7: 'lg:col-span-7', 8: 'lg:col-span-8' } as const

export function Col({ span, className, children }: { span: keyof typeof SPAN; className?: string; children: ReactNode }) {
  return <div className={clsx('flex flex-col gap-4 lg:gap-6 min-w-0', SPAN[span], className)}>{children}</div>
}

/** Row of small figures on white tiles (keeps a screen short instead of one list row each). */
export function Stats({ items }: { items: { label: string; value: ReactNode; sub?: string }[] }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map(i => (
        <div key={i.label} className="p-2 lg:p-4 rounded-2xl flex flex-col" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
          <span className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>{i.label}</span>
          <span className="text-[14px] leading-5 lg:text-[16px] lg:leading-6 font-semibold tabular-nums break-words" style={{ color: 'var(--ink)' }}>{i.value}</span>
          {/* A note on the figure (e.g. "0.2 / 3 months") is its own line, so it wraps inside the tile instead of spilling out of it. */}
          {i.sub && <span className="text-[14px] leading-5 break-words" style={{ color: 'var(--subtle)' }}>{i.sub}</span>}
        </div>
      ))}
    </div>
  )
}

/** Screen title: Web Mobile/H2 32/40, desktop Web/H2 40/48. */
export function Title({ children }: { children: ReactNode }) {
  return <h2 className="display font-bold text-[32px] leading-10 lg:text-[40px] lg:leading-[48px]" style={{ color: 'var(--ink)' }}>{children}</h2>
}

/** Floating card: Ground + Shadow/Y2, radius 16. */
export function GlassCard({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <section className={clsx('overflow-hidden', className)} style={{ ...glass.card, ...style }}>{children}</section>
}

/** Small uppercase label above a value ("ĐỊA CHỈ VÍ"). */
export function Caps({ children }: { children: ReactNode }) {
  return <p className="text-[14px] leading-5 font-semibold uppercase" style={{ color: 'var(--muted)' }}>{children}</p>
}

type BtnVariant = 'primary' | 'outline' | 'danger'

/**
 * Web/Button. Default 48 high, padding 24, 16/24 semibold; small 40 high, padding 16, 14/20.
 * Primary = Blue, outline = the secondary button (Ground + Blue text); both carry Shadow/Y2.
 * Disabled = Line fill + Muted text, no shadow.
 */
export function Btn({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'md' | 'sm'; loading?: boolean }) {
  const off = disabled || loading
  const style: CSSProperties = off
    ? { background: 'var(--line)', color: 'var(--muted)' }
    : variant === 'primary' ? { background: 'var(--accent)', color: 'white', boxShadow: 'var(--shadow-y2)' }
    : variant === 'danger' ? { background: 'var(--danger)', color: 'white', boxShadow: 'var(--shadow-y2)' }
    : { background: 'var(--bg)', color: 'var(--accent)', border: '1px solid var(--line)' }
  return (
    <button {...rest} disabled={off} style={style}
      className={clsx('w-full rounded-2xl font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap',
        size === 'md' ? 'h-12 px-6 text-[16px] leading-6' : 'h-10 px-4 text-[14px] leading-5',
        off && 'cursor-not-allowed', className)}>
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  )
}

const NOTICE = {
  info:    { Icon: Info,          bg: '#E8F0FE', color: 'var(--accent-dark)' },
  success: { Icon: CheckCircle2,  bg: '#E3F5EC', color: '#0B7A45' },
  warning: { Icon: AlertTriangle, bg: '#FEF5D9', color: '#8A5F00' },
  danger:  { Icon: AlertCircle,   bg: '#FDE8EB', color: '#C42B3F' },
} as const

export function Notice({ tone, title, children }: { tone: keyof typeof NOTICE; title?: string; children?: ReactNode }) {
  const n = NOTICE[tone]
  return (
    <div className="p-4 flex items-start gap-2" style={{ background: n.bg, borderRadius: 16 }}>
      <n.Icon size={20} style={{ color: n.color, flexShrink: 0 }} />
      <div className="min-w-0 flex flex-col gap-2">
        {title && <p className="text-[16px] leading-5 font-semibold" style={{ color: n.color }}>{title}</p>}
        {children && <div className="text-[14px] leading-5" style={{ color: n.color }}>{children}</div>}
      </div>
    </div>
  )
}

/** List row: min 56 high, padding 16 (desktop 32), label Web/Body grey, value 16 semibold. */
export function Row({ label, sub, value, color, last }: { label: string; sub?: string; value: ReactNode; color?: string; last?: boolean }) {
  return (
    <div className="min-h-14 flex items-center justify-between gap-4 px-4 py-4 lg:px-8" style={{ borderBottom: last ? 'none' : '1px solid var(--line)' }}>
      <div className="min-w-0">
        <p className="text-[16px] leading-6" style={{ color: 'var(--subtle)' }}>{label}</p>
        {sub && <p className="text-[14px] leading-5" style={{ color: 'var(--muted)' }}>{sub}</p>}
      </div>
      <div className="font-semibold text-[16px] leading-6 tabular-nums text-right" style={{ color: color ?? 'var(--ink)' }}>{value}</div>
    </div>
  )
}

/** Quick amounts: small secondary buttons sharing the width. */
export function Chips({ items }: { items: { label: string; onClick: () => void; disabled?: boolean }[] }) {
  return (
    <div className="flex gap-2">
      {items.map(c => <Btn key={c.label} variant="outline" size="sm" onClick={c.onClick} disabled={c.disabled}>{c.label}</Btn>)}
    </div>
  )
}

/** USDC amount: Web/Input spec (48 high, padding 16, Mist + Line 1px, focus Blue 2px). Value is the cleaned string ("1234,5"). */
export function AmountField({ value, onChange, disabled, label = 'Amount' }: { value: string; onChange: (v: string) => void; disabled?: boolean; label?: string }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[14px] leading-5 font-semibold" style={{ color: 'var(--subtle)' }}>{label}</span>
      <div className="h-12 flex items-center gap-2 px-4 rounded-2xl border border-[var(--line)] focus-within:border-2 focus-within:border-[var(--accent)]"
        style={{ background: 'var(--surface-muted)' }}>
        <input inputMode="decimal" value={value} disabled={disabled} placeholder="0"
          onChange={e => onChange(cleanUsdcInput(e.target.value))}
          className="flex-1 min-w-0 bg-transparent text-[16px] leading-6 tabular-nums outline-none placeholder:text-[var(--muted)]"
          style={{ color: 'var(--ink)' }} />
        <span className="text-[14px] leading-5 font-semibold" style={{ color: 'var(--subtle)' }}>USDC</span>
      </div>
    </label>
  )
}

/** Segmented control: Mist track, padding 8; the chosen option is Ground + Shadow/Y2 with Blue text. */
export function Toggle<T extends string>({ value, options, onChange }: { value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-2 p-2 rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className="flex-1 h-10 rounded-2xl text-[16px] leading-6 font-semibold transition-colors"
          style={value === o.value ? { background: 'var(--bg)', color: 'var(--accent)', boxShadow: 'var(--shadow-y2)' } : { color: 'var(--subtle)' }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Dropdown: a label on the left, the chosen value on a Mist pill on the right with a chevron. It is a real <select>, so it opens
 * the system list. With one option (or `disabled`) the chevron and text go grey and it cannot be opened ("coming later").
 */
export function Dropdown<T extends string>({ label, value, options, onChange, disabled }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange?: (v: T) => void; disabled?: boolean
}) {
  const locked = disabled || options.length < 2
  return (
    <label className="flex items-center justify-between gap-4 min-h-12">
      <span className="text-[16px] leading-6" style={{ color: 'var(--subtle)' }}>{label}</span>
      <span className="relative inline-flex">
        <select value={value} disabled={locked} aria-label={label} onChange={e => onChange?.(e.target.value as T)}
          className="appearance-none h-12 min-w-[144px] pl-4 pr-12 rounded-2xl text-[16px] leading-6 font-semibold outline-none focus-visible:outline-none border border-[var(--line)] focus:border-[var(--accent)] focus:shadow-[inset_0_0_0_1px_var(--accent)] disabled:cursor-not-allowed"
          style={{ background: 'var(--surface-muted)', color: locked ? 'var(--muted)' : 'var(--ink)' }}>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown size={20} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: locked ? 'var(--muted)' : 'var(--ink)' }} />
      </span>
    </label>
  )
}

/** Bottom sheet on mobile, centred dialog on desktop, over the scrim. */
export function Sheet({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center" style={{ background: 'rgba(0,0,0,0.48)' }}>
      <div className="w-full max-w-[430px] mx-auto p-4 pb-8 lg:pb-4 flex flex-col gap-4 rounded-t-2xl lg:rounded-2xl"
        style={{ background: 'var(--bg)', boxShadow: 'var(--shadow-y2)' }}>
        <div className="w-10 h-1 rounded-full mx-auto lg:hidden" style={{ background: 'var(--line)' }} />
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
    <div className="p-2 bg-white" style={{ width: size, height: size, borderRadius: 16, border: '1px solid var(--line)' }}>
      {src && <img src={src} alt="Wallet address QR code" className="w-full h-full" />}
    </div>
  )
}

export function CopyButton({ text, label = 'Copy address' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Btn variant="outline" size="sm" className="!w-auto"
      onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 2000) }) }}>
      <Copy size={16} />
      {done ? 'Copied' : label}
    </Btn>
  )
}

export function IconBox({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'yellow' | 'red' }) {
  const bg = tone === 'blue' ? '#E8F0FE' : tone === 'yellow' ? '#FEF5D9' : '#FDE8EB'
  return <div className="w-12 h-12 flex items-center justify-center flex-shrink-0" style={{ background: bg, borderRadius: 16 }}>{children}</div>
}
