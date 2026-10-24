// Screen 1 — Trang chủ (Figma "01 Trang chủ"): mobile = lockup, tagline, four steps,
// sign-in at the bottom; desktop = hero 6 col + fund preview card 6 col.

import { useLogin } from '@privy-io/react-auth'
import { Vault } from 'lucide-react'
import { Wordmark } from '@/components/ui/kit'

const STEPS = ['Know your cash flow', 'Build an emergency fund', 'Balance your assets', 'Unlock investing']

function Steps() {
  return (
    <ol className="w-full max-w-[296px] lg:max-w-[384px] flex flex-col gap-2">
      {STEPS.map((step, i) => (
        <li key={step} className="h-12 flex items-center gap-4 px-4 rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
          <span className="w-6 h-6 rounded-full flex items-center justify-center text-[14px] leading-5 font-semibold flex-shrink-0" style={{ background: 'var(--accent)', color: 'white' }}>{i + 1}</span>
          <span className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>{step}</span>
        </li>
      ))}
    </ol>
  )
}

export function LoginScreen() {
  const { login } = useLogin()
  const signIn = (
    <button onClick={() => login()}
      className="w-full max-w-[296px] h-12 lg:w-auto lg:h-14 lg:px-8 rounded-2xl text-[16px] leading-6 font-semibold"
      style={{ background: 'var(--accent)', color: 'white', boxShadow: 'var(--shadow-y2)' }}>
      Log in
    </button>
  )

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)' }}>
      {/* Mobile */}
      <div className="lg:hidden min-h-dvh flex flex-col items-center justify-between px-4 pt-24 pb-12">
        <div className="flex flex-col items-center gap-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <h1><Wordmark size={32} /></h1>
            <p className="max-w-[296px] text-[24px] leading-8 font-semibold" style={{ color: 'var(--ink)' }}>Onchain personal finance for Web3</p>
          </div>
          <Steps />
        </div>
        {signIn}
      </div>

      {/* Desktop */}
      <div className="hidden lg:flex min-h-dvh items-center">
        <div className="w-full max-w-[1248px] mx-auto px-6 grid grid-cols-12 gap-6 items-center">
          <div className="col-span-6 flex flex-col items-start gap-8">
            <h1><Wordmark size={40} /></h1>
            <p className="display text-[56px] leading-[64px] font-bold" style={{ color: 'var(--ink)' }}>Onchain personal finance for Web3</p>
            <Steps />
            {signIn}
          </div>
          <div className="col-span-6 flex justify-center">
            {/* The one gradient region on this screen */}
            <div className="w-[384px] p-8 flex flex-col gap-2 rounded-2xl"
              style={{ background: 'linear-gradient(to top right, #0F3DB2, #1E6DF7)', boxShadow: 'var(--shadow-y2)' }}>
              <div className="flex items-center gap-2">
                <Vault size={20} color="white" />
                <span className="text-[14px] leading-5 font-semibold text-white">Emergency fund</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="display text-[48px] leading-[56px] font-bold text-white tabular-nums">1.000</span>
                <span className="text-[20px] leading-7 font-semibold text-white">USDC</span>
              </div>
              <p className="text-[16px] leading-6 text-white">3 to 6 months of essential spending</p>
              <div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.24)' }}>
                <div className="h-full w-1/2 rounded-full bg-white" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
