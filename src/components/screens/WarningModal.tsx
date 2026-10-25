import { AlertTriangle } from 'lucide-react'

interface WarningModalProps { onAcknowledge: () => void }

export function WarningModal({ onAcknowledge }: WarningModalProps) {
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
          {[
            'MoonSafe records your money and suggests options, not investment advice. You decide, and you sign every transaction in your own wallet.',
            'No returns are promised. Crypto, stocks and gold can fall sharply.',
            'Test version on Arc Testnet: USDC and cirBTC here are test tokens with no real value.',
          ].map((item, i) => (
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

        <button
          onClick={onAcknowledge}
          className="w-full h-12 rounded-2xl font-semibold text-[16px] leading-6 text-white"
          style={{ background:'var(--accent)' }}
        >
          I understand
        </button>
      </div>
    </div>
  )
}
