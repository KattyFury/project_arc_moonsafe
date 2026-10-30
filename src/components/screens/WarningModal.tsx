// "Before you start" (spec 8.4): the three points from the KB, the only place besides the order
// cards where the disclaimer lives (never repeated in chat). Testnet note kept under them.

import { AlertTriangle } from 'lucide-react'
import { KB } from '@/kb/kb'
import { IS_MAINNET } from '@/lib/network'

interface WarningModalProps { onAcknowledge: () => void }

export function WarningModal({ onAcknowledge }: WarningModalProps) {
  // The email requirement (2026-10-29) was removed the same day: Privy refused to link an email to a wallet that already had one
  // ("User already has one email account linked"), which blocked that user from entering the app.
  return (
    // Mobile: a bottom sheet across the full width; desktop: a 560 dialog in the middle (was a 340 box on both, too narrow).
    <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center" style={{ background:'rgba(0,0,0,0.48)' }}>
      <div
        className="rise-in w-full lg:max-w-[560px] p-6 pb-8 lg:p-8 flex flex-col gap-6 rounded-t-3xl lg:rounded-3xl"
        style={{ background:'white', boxShadow: 'var(--shadow-y2)' }}
      >
        <div className="w-10 h-1 rounded-full mx-auto -mt-2 lg:hidden" style={{ background: 'var(--line)' }} />
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 flex items-center justify-center flex-shrink-0"
            style={{ background:'#FEF5D9', borderRadius:16 }}
          >
            <AlertTriangle size={24} style={{ color:'#F5B301' }} />
          </div>
          <p className="display font-bold text-[24px] leading-8" style={{ color:'var(--ink)' }}>Before you start</p>
        </div>

        <ul className="flex flex-col gap-4">
          {KB.voice.before_you_start.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[14px] font-bold"
                style={{ background:'var(--accent-soft)', color:'var(--accent)', minWidth:24 }}
              >
                {i + 1}
              </span>
              <p className="text-[16px] leading-6" style={{ color:'var(--ink)' }}>{item}</p>
            </li>
          ))}
        </ul>
        <p className="text-[14px] leading-5 p-4 rounded-2xl" style={{ color:'var(--subtle)', background:'var(--page)' }}>{IS_MAINNET ? 'This version runs on Arc mainnet with real USDC and cirBTC. You sign every transaction in your own wallet, and a signed transaction cannot be undone.' : 'Test version on Arc Testnet: USDC and cirBTC here are test tokens with no real value. You sign every transaction in your own wallet.'}</p>

        <button
          onClick={onAcknowledge}
          className="w-full h-14 rounded-2xl font-semibold text-[16px] leading-6 transition-transform active:scale-[0.98]"
          style={{ background:'var(--accent)', color:'white', boxShadow:'var(--shadow-blue)' }}
        >
          I understand
        </button>
      </div>
    </div>
  )
}
