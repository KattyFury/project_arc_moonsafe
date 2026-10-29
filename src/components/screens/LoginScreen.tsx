// The landing page (Hieu, 2026-10-29: "short and beautiful, so people get what the app does at a glance"), on the nguyen0xhieu
// design system: web-mobile-* type on 393, web-* on 1440, spacing in 8s, radius 16, shadow Y2, one gradient region (desktop: the
// chat preview). Fits one screen on both (393×852, 1440×900). The only action is "Get started" (Privy sign-in).

import { useLogin } from '@privy-io/react-auth'
import { MessageCircle, TrendingUp, Vault, type LucideIcon } from 'lucide-react'
import { Wordmark } from '@/components/ui/kit'

const POINTS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: MessageCircle, title: 'Learn as you chat', text: 'Plain answers on cash flow, safety nets and how to split your money.' },
  { icon: Vault, title: 'A safety net onchain', text: 'Your emergency fund sits in your own USDC vault on Arc. Only you can withdraw.' },
  { icon: TrendingUp, title: 'Invest in balance', text: 'Stocks, gold and Bitcoin, split by your age and bought step by step.' },
]

const PRICE = 'Free: 20 messages a day. Opening your vault: 1 USDC, once.'

function Point({ icon: Icon, title, text }: (typeof POINTS)[number]) {
  return (
    <div className="flex items-start gap-4">
      <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-soft)' }}>
        <Icon size={20} style={{ color: 'var(--accent)' }} />
      </span>
      <div className="flex flex-col">
        <span className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>{title}</span>
        <span className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>{text}</span>
      </div>
    </div>
  )
}

/** A short exchange with the agent: what the app does, shown instead of told. The one gradient region on the page. */
function ChatPreview() {
  const bubble = 'px-4 py-2 rounded-2xl text-[16px] leading-6'
  return (
    <div className="w-full max-w-[488px] p-8 flex flex-col gap-4 rounded-2xl"
      style={{ background: 'linear-gradient(to top right, var(--accent-dark), var(--accent))', boxShadow: 'var(--shadow-y2)' }}>
      <div className={`${bubble} self-end max-w-[80%]`} style={{ background: 'var(--accent-dark)', color: 'white' }}>
        I have $3,000 and want to start investing.
      </div>
      <div className={`${bubble} self-start max-w-[90%] flex flex-col gap-2`} style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
        <span>First, a safety net: <strong>3 months of spending</strong> in your own vault, so a bad month never forces you to sell.</span>
        <span>Then split the rest by your age, 30: <strong>30% safe</strong>, <strong>35% stocks and gold</strong>, <strong>35% crypto</strong>, mostly Bitcoin.</span>
      </div>
      <div className={`${bubble} self-end max-w-[80%]`} style={{ background: 'var(--accent-dark)', color: 'white' }}>
        Why that split?
      </div>
    </div>
  )
}

export function LoginScreen() {
  const { login } = useLogin()
  const cta = (wide: boolean) => (
    <button onClick={() => login()}
      className={`${wide ? 'h-14 px-8' : 'w-full h-12 px-6'} rounded-2xl text-[16px] leading-6 font-semibold`}
      style={{ background: 'var(--accent)', color: 'white', boxShadow: 'var(--shadow-y2)' }}>
      Get started
    </button>
  )

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)' }}>
      {/* Mobile web 393: margins 16, blocks 32 apart */}
      <div className="lg:hidden min-h-dvh flex flex-col px-4 pt-12 pb-8 gap-8">
        <Wordmark size={24} />
        <div className="flex flex-col gap-4">
          <h1 className="display text-[40px] leading-[48px] font-bold" style={{ color: 'var(--ink)' }}>Your personal finance agent for Web3</h1>
          <p className="text-[18px] leading-7" style={{ color: 'var(--subtle)' }}>Tell it about your money. It shows you what to do next, and why.</p>
        </div>
        <div className="flex flex-col gap-4">
          {POINTS.map(p => <Point key={p.title} {...p} />)}
        </div>
        <div className="mt-auto flex flex-col gap-2">
          {cta(false)}
          <p className="text-[14px] leading-5 text-center" style={{ color: 'var(--subtle)' }}>{PRICE}</p>
        </div>
      </div>

      {/* Web 1440: content 1200 on 12 columns, gutter 24, blocks 64 apart */}
      <div className="hidden lg:flex min-h-dvh flex-col">
        <header className="w-full max-w-[1248px] mx-auto px-6 h-[72px] flex items-center justify-between">
          <Wordmark size={20} />
          <button onClick={() => login()} className="h-10 px-4 rounded-2xl text-[16px] leading-6 font-semibold" style={{ color: 'var(--accent)' }}>Log in</button>
        </header>
        <main className="flex-1 w-full max-w-[1248px] mx-auto px-6 flex flex-col justify-center gap-16 py-12">
          <div className="grid grid-cols-12 gap-6 items-center">
            <div className="col-span-6 flex flex-col items-start gap-8">
              <div className="flex flex-col gap-6">
                <h1 className="display text-[56px] leading-[64px] font-bold" style={{ color: 'var(--ink)' }}>Your personal finance agent for Web3</h1>
                <p className="max-w-[520px] text-[18px] leading-7" style={{ color: 'var(--subtle)' }}>Tell it about your money. It shows you what to do next, and why: a safety net first, then a balanced way to invest.</p>
              </div>
              <div className="flex flex-col gap-2">
                {cta(true)}
                <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>{PRICE}</p>
              </div>
            </div>
            <div className="col-span-6 flex justify-end"><ChatPreview /></div>
          </div>
          <div className="grid grid-cols-3 gap-6">
            {POINTS.map(p => <Point key={p.title} {...p} />)}
          </div>
        </main>
      </div>
    </div>
  )
}
