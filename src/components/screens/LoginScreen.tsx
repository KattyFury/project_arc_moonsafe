// The landing page (Hieu, 2026-10-29: "short and beautiful, so people get what the app does at a glance"; refresh 2026-10-30,
// direction "Bright": a product preview instead of a chat preview). nguyen0xhieu design system: spacing in 8s, radius 16, one
// gradient region (the preview). Fits one screen on both (393×852, 1440×900). The only action is "Get started" (Privy sign-in).

import { useLogin } from '@privy-io/react-auth'
import { ArrowRight, MessageCircle, TrendingUp, Vault, type LucideIcon } from 'lucide-react'
import { Wordmark } from '@/components/ui/kit'
import { IS_MAINNET, NET } from '@/lib/network'

const POINTS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: MessageCircle, title: 'Learn as you chat', text: 'Plain answers on cash flow, safety nets and how to split your money.' },
  { icon: Vault, title: 'A safety net onchain', text: 'Your emergency fund sits in your own USDC vault on Arc. Only you can withdraw.' },
  { icon: TrendingUp, title: 'Invest in balance', text: 'Stocks, gold and Bitcoin, split by your age and bought step by step.' },
]

const PRICE = 'Free: 20 messages a day. Opening your vault: 1 USDC, once.'

function Point({ icon: Icon, title, text, short }: (typeof POINTS)[number] & { short?: boolean }) {
  return (
    <div className="flex items-start gap-4">
      <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-soft)' }}>
        <Icon size={16} style={{ color: 'var(--accent)' }} />
      </span>
      <div className="flex flex-col">
        <span className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>{title}</span>
        {!short && <span className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>{text}</span>}
      </div>
    </div>
  )
}

/** Green dot + network: the app is live, on which chain. */
function LiveTag() {
  return (
    <span className="h-8 px-4 rounded-full inline-flex items-center gap-2 text-[14px] leading-5" style={{ background: 'var(--bg)', color: 'var(--subtle)', boxShadow: 'var(--shadow-y2)' }}>
      <span className="w-2 h-2 rounded-full" style={{ background: '#0F9D58' }} />
      {IS_MAINNET ? 'Live on Arc' : `Running on ${NET.name}`}
    </span>
  )
}

/** Progress ring for the preview fund card. */
function Ring({ pct, size }: { pct: number; size: number }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r
  return (
    <span className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent-soft)" strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={8} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset 900ms' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[16px] leading-6 font-bold tabular-nums">{pct}%</span>
    </span>
  )
}

const SPLIT = [{ name: 'Safe', pct: 30, color: 'var(--accent)' }, { name: 'Stocks & gold', pct: 35, color: '#5B95FA' }, { name: 'Crypto', pct: 35, color: 'var(--accent-dark)' }]

/**
 * What the app does, shown instead of told: an example emergency fund, a line from the agent and (desktop) the split by age.
 * The one gradient region on the page. Figures are an example, not the visitor's money.
 */
function ProductPreview({ wide }: { wide: boolean }) {
  const card = { background: 'var(--bg)', borderRadius: 16, boxShadow: '0 12px 32px rgba(0,20,80,0.25)' }
  return (
    <div className={`relative overflow-hidden rounded-3xl flex flex-col ${wide ? 'w-[520px] p-10 gap-4' : 'p-4 gap-2'}`}
      style={{ background: 'linear-gradient(140deg, #2A7BFF, var(--accent-dark))' }}>
      <span aria-hidden className="absolute rounded-full" style={{ width: 420, height: 420, right: -160, top: -180, border: '1px solid rgba(255,255,255,0.18)', boxShadow: '0 0 0 48px rgba(255,255,255,0.04), 0 0 0 96px rgba(255,255,255,0.03)' }} />
      <div className="rise-in relative p-4 flex items-center gap-4" style={card}>
        <Ring pct={62} size={wide ? 72 : 64} />
        <div className="flex flex-col min-w-0">
          <span className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Emergency fund · your vault</span>
          <span className={`${wide ? 'text-[24px] leading-8' : 'text-[20px] leading-7'} font-bold tabular-nums`} style={{ color: 'var(--ink)' }}>$1,860.00</span>
          <span className="text-[14px] leading-5" style={{ color: 'var(--muted)' }}>of $3,000 goal</span>
        </div>
      </div>
      <div className="rise-in relative px-4 py-2 self-end max-w-[88%] flex items-start gap-2" style={{ ...card, animationDelay: '120ms' }}>
        <img src="/logo.svg" alt="" width={24} height={24} className="flex-shrink-0 mt-1" />
        <span className={`${wide ? 'text-[16px] leading-6' : 'text-[14px] leading-5'}`} style={{ color: 'var(--ink)' }}>
          Keep going: <strong>$1,140</strong> more and your safety net is full. Then we split the rest by your age.
        </span>
      </div>
      {wide && (
        <div className="rise-in relative p-4 flex flex-col gap-2" style={{ ...card, animationDelay: '240ms' }}>
          <span className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Suggested split at age 30</span>
          {SPLIT.map(s => (
            <div key={s.name} className="flex items-center gap-4 text-[14px] leading-5">
              <span className="w-[112px]" style={{ color: 'var(--ink)' }}>{s.name}</span>
              <span className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--accent-soft)' }}>
                <span className="fill-in block h-full rounded-full" style={{ width: `${s.pct * 2.4}%`, background: s.color }} />
              </span>
              <strong className="w-10 text-right tabular-nums">{s.pct}%</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function LoginScreen() {
  const { login } = useLogin()
  const cta = (wide: boolean) => (
    <button onClick={() => login()}
      className={`${wide ? 'h-14 px-8' : 'w-full h-14 px-6'} rounded-2xl text-[16px] leading-6 font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-transform active:scale-[0.98]`}
      style={{ background: 'var(--accent)', color: 'white', boxShadow: 'var(--shadow-blue)' }}>
      Get started <ArrowRight size={20} />
    </button>
  )
  const title = (cls: string) => (
    <h1 className={`display font-bold ${cls}`} style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
      Your <span style={{ color: 'var(--accent)' }}>personal finance agent</span> for Web3
    </h1>
  )

  return (
    <div className="min-h-dvh" style={{ background: 'var(--page)' }}>
      {/* Mobile web 393: margins 16 */}
      <div className="lg:hidden min-h-dvh flex flex-col px-4 pt-6 pb-6 gap-6">
        <div className="flex items-center justify-between"><Wordmark size={20} /><LiveTag /></div>
        <div className="rise-in flex flex-col gap-4">
          {title('text-[40px] leading-[44px]')}
          <p className="text-[16px] leading-6" style={{ color: 'var(--subtle)' }}>Tell it about your money. It shows you what to do next, and why.</p>
        </div>
        <ProductPreview wide={false} />
        <div className="flex flex-col gap-4">
          {POINTS.map(p => <Point key={p.title} {...p} short />)}
        </div>
        <div className="mt-auto flex flex-col gap-2">
          {cta(false)}
          <p className="text-[14px] leading-5 text-center" style={{ color: 'var(--muted)' }}>{PRICE}</p>
        </div>
      </div>

      {/* Web 1440: content 1200 on 12 columns, gutter 24 */}
      <div className="hidden lg:flex min-h-dvh flex-col">
        <header className="w-full max-w-[1248px] mx-auto px-6 h-[72px] flex items-center justify-between">
          <Wordmark size={20} />
          <div className="flex items-center gap-4">
            <LiveTag />
            <button onClick={() => login()} className="h-10 px-4 rounded-2xl text-[16px] leading-6 font-semibold" style={{ color: 'var(--accent)' }}>Log in</button>
          </div>
        </header>
        <main className="flex-1 w-full max-w-[1248px] mx-auto px-6 py-8 grid grid-cols-12 gap-6 items-center">
          <div className="rise-in col-span-7 flex flex-col items-start gap-8 pr-16">
            {title('text-[56px] leading-[64px]')}
            <p className="max-w-[520px] text-[20px] leading-7" style={{ color: 'var(--subtle)' }}>Tell it about your money. It shows you what to do next, and why: a safety net first, then a balanced way to invest.</p>
            <div className="flex flex-col gap-4">
              {POINTS.map(p => <Point key={p.title} {...p} />)}
            </div>
            <div className="flex items-center gap-6">
              {cta(true)}
              <p className="text-[14px] leading-5" style={{ color: 'var(--muted)' }}>{PRICE}</p>
            </div>
          </div>
          <div className="col-span-5 flex justify-end"><ProductPreview wide /></div>
        </main>
      </div>
    </div>
  )
}
