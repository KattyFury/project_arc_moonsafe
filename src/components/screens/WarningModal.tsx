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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background:'rgba(0,0,0,0.48)' }}
    >
      <div
        className="w-full max-w-[340px] p-6 flex flex-col gap-6"
        style={{ background:'white', borderRadius: 16, boxShadow: '0 2px 8px 0 rgba(0,0,0,0.32)' }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-12 h-12 flex items-center justify-center flex-shrink-0"
            style={{ background:'#FEF5D9', borderRadius:16 }}
          >
            <AlertTriangle size={20} style={{ color:'#F5B301' }} />
          </div>
          <p className="font-semibold text-[18px]" style={{ color:'var(--ink)' }}>Before you start</p>
        </div>

        <ul className="flex flex-col gap-2">
          {KB.voice.before_you_start.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[14px] font-bold"
                style={{ background:'var(--surface-muted)', color:'var(--subtle)', minWidth:20 }}
              >
                {i + 1}
              </span>
              <p className="text-[14px] leading-relaxed" style={{ color:'var(--subtle)' }}>{item}</p>
            </li>
          ))}
        </ul>
        <p className="text-[14px] leading-5 -mt-2" style={{ color:'var(--muted)' }}>{IS_MAINNET ? 'This version runs on Arc mainnet with real USDC and cirBTC. You sign every transaction in your own wallet, and a signed transaction cannot be undone.' : 'Test version on Arc Testnet: USDC and cirBTC here are test tokens with no real value. You sign every transaction in your own wallet.'}</p>

        <button
          onClick={onAcknowledge}
          className="w-full h-12 rounded-2xl font-semibold text-[16px] leading-6"
          style={{ background:'var(--accent)', color:'white' }}
        >
          I understand
        </button>
      </div>
    </div>
  )
}
