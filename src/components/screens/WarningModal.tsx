// "Before you start" (spec 8.4): the three points from the KB, the only place besides the order
// cards where the disclaimer lives (never repeated in chat). Network note kept under them.
// 2026-10-30 (direction 1): no warning badge or number bubbles; the points read as a short ruled list, the logo opens the sheet.

import { KB } from '@/kb/kb'
import { IS_MAINNET } from '@/lib/network'

interface WarningModalProps { onAcknowledge: () => void }

export function WarningModal({ onAcknowledge }: WarningModalProps) {
  // The email requirement (2026-10-29) was removed the same day: Privy refused to link an email to a wallet that already had one
  // ("User already has one email account linked"), which blocked that user from entering the app.
  return (
    // Mobile: a bottom sheet across the full width that slides up; desktop: a 480 dialog in the middle.
    <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="before-title"
        className="sheet-in w-full lg:max-w-[480px] px-6 pt-4 pb-8 lg:p-8 flex flex-col gap-6 rounded-t-[28px] lg:rounded-[24px]"
        style={{ background: 'var(--bg)' }}>
        <div className="w-10 h-1 rounded-full mx-auto lg:hidden" style={{ background: 'var(--line)' }} />
        <div className="flex flex-col gap-4">
          <img src="/logo.svg" alt="" width={40} height={40} />
          <h2 id="before-title" className="display font-bold text-[28px] leading-8" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>Before you start</h2>
        </div>

        <ol className="flex flex-col" style={{ borderTop: '1px solid var(--line)' }}>
          {KB.voice.before_you_start.map((item, i) => (
            <li key={i} className="flex gap-4 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
              <span className="w-4 flex-shrink-0 text-[16px] leading-6 font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>{i + 1}</span>
              <p className="text-[16px] leading-6" style={{ color: 'var(--ink)' }}>{item}</p>
            </li>
          ))}
        </ol>
        <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>{IS_MAINNET ? 'This version runs on Arc mainnet with real USDC and cirBTC. You sign every transaction in your own wallet, and a signed transaction cannot be undone.' : 'Test version on Arc Testnet: USDC and cirBTC here are test tokens with no real value. You sign every transaction in your own wallet.'}</p>

        <button
          onClick={onAcknowledge}
          className="w-full h-14 rounded-2xl font-semibold text-[16px] leading-6 transition-transform active:scale-[0.98]"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          I understand
        </button>
      </div>
    </div>
  )
}
