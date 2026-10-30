// The landing page (Hieu, 2026-10-29: "short and beautiful, so people get what the app does at a glance"). Direction 1, "the product
// performs" (Hieu, 2026-10-30): instead of a feature list, a real exchange with the agent and the fund it leads to. Flat white, 1px
// lines, no shadows or gradients. Fits one screen on both (393×852, 1440×900). The only action is "Get started" (Privy sign-in).

import { useLogin } from '@privy-io/react-auth'
import { ArrowRight } from 'lucide-react'
import { Wordmark } from '@/components/ui/kit'

const PRICE = 'Free: 20 messages a day. Opening your vault: 1 USDC, once.'

/** One exchange with the agent and the fund card it leads to. Figures are an example, not the visitor's money. */
function ChatDemo({ wide }: { wide: boolean }) {
  const text = wide ? 'text-[16px] leading-6' : 'text-[15px] leading-[22px]'
  return (
    <div className={`w-full flex flex-col gap-4 rounded-[20px] ${wide ? 'max-w-[560px] p-6' : 'p-4'}`}
      style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
      <div className={`rise-in self-end max-w-[85%] px-4 py-3 rounded-[20px] rounded-br-md ${text}`} style={{ background: 'var(--accent)', color: 'white' }}>
        How big should my emergency fund be?
      </div>
      <div className="rise-in flex gap-2 items-end" style={{ animationDelay: '200ms' }}>
        <img src="/logo.svg" alt="" width={28} height={28} className="flex-shrink-0" />
        <div className={`px-4 py-3 rounded-[20px] rounded-bl-md ${text}`} style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}>
          {wide
            ? <>You spend about <strong>$1,000 a month</strong>, so a <strong>3-month floor of $3,000</strong> fits you: steady salary, nobody relying on you.<br /><br />Your vault holds <strong>$2,000</strong>, so <strong>$1,000 more</strong> fills it. After that, Balance and Invest open.</>
            : <>You spend about <strong>$1,000 a month</strong>, so a <strong>3-month floor of $3,000</strong> fits you. Your vault holds <strong>$2,000</strong>: <strong>$1,000 more</strong> fills it.</>}
        </div>
      </div>
      <div className="rise-in ml-9 px-4 py-3 rounded-2xl flex flex-col gap-2" style={{ background: 'var(--accent-soft)', animationDelay: '400ms' }}>
        <div className="flex justify-between text-[14px] leading-5">
          <span style={{ color: 'var(--subtle)' }}>Emergency fund</span>
          <strong className="tabular-nums" style={{ color: 'var(--ink)' }}>$2,000 of $3,000</strong>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg)' }}>
          <div className="fill-in h-full rounded-full" style={{ width: '66.6%', background: 'var(--accent)', animationDelay: '400ms' }} />
        </div>
      </div>
    </div>
  )
}

export function LoginScreen() {
  const { login } = useLogin()
  const cta = (wide: boolean) => (
    <button onClick={() => login()}
      className={`${wide ? 'h-14 px-8' : 'w-full h-14 px-6'} rounded-2xl text-[16px] leading-6 font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-transform active:scale-[0.98]`}
      style={{ background: 'var(--accent)', color: 'white' }}>
      Get started <ArrowRight size={20} />
    </button>
  )
  const title = (cls: string) => (
    <h1 className={`display font-bold ${cls}`} style={{ color: 'var(--ink)', letterSpacing: '-0.035em' }}>
      Your <span style={{ color: 'var(--accent)' }}>personal finance agent</span> for Web3
    </h1>
  )
  const sub = 'Tell it about your money. It shows you what to do next, and why.'

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)' }}>
      {/* Mobile web 393: margins 16 */}
      <div className="lg:hidden min-h-dvh flex flex-col px-4 pt-4 pb-6 gap-6">
        <Wordmark size={20} />
        <div className="flex flex-col gap-4">
          {title('text-[40px] leading-[44px]')}
          <p className="text-[16px] leading-6" style={{ color: 'var(--subtle)' }}>{sub}</p>
        </div>
        <ChatDemo wide={false} />
        <div className="mt-auto flex flex-col gap-2">
          {cta(false)}
          <p className="text-[14px] leading-5 text-center" style={{ color: 'var(--muted)' }}>{PRICE}</p>
        </div>
      </div>

      {/* Web 1440: content 1200 on 12 columns, gutter 24 */}
      <div className="hidden lg:flex min-h-dvh flex-col">
        <header className="w-full max-w-[1248px] mx-auto px-6 h-20 flex items-center justify-between">
          <Wordmark size={20} />
          <button onClick={() => login()} className="h-10 px-4 rounded-2xl text-[16px] leading-6 font-semibold" style={{ color: 'var(--accent)' }}>Log in</button>
        </header>
        <main className="flex-1 w-full max-w-[1248px] mx-auto px-6 py-8 grid grid-cols-12 gap-6 items-center">
          <div className="col-span-6 flex flex-col items-start gap-8 pr-12">
            {title('text-[64px] leading-[68px]')}
            <p className="max-w-[480px] text-[20px] leading-7" style={{ color: 'var(--subtle)' }}>{sub}</p>
            <div className="flex items-center gap-6">
              {cta(true)}
              <p className="text-[14px] leading-5 max-w-[240px]" style={{ color: 'var(--muted)' }}>{PRICE}</p>
            </div>
          </div>
          <div className="col-span-6 flex justify-end"><ChatDemo wide /></div>
        </main>
      </div>
    </div>
  )
}
