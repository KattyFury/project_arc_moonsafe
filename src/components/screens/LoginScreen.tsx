import { useLogin } from '@privy-io/react-auth'
import { Shield } from 'lucide-react'

export function LoginScreen() {
  const { login } = useLogin()

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-between px-6 pt-20 pb-12"
      style={{ background:'linear-gradient(160deg, #0a2470 0%, #0F3DB2 45%, #1E6DF7 100%)' }}
    >
      {/* Top: logo + tagline */}
      <div className="flex flex-col items-center gap-6 flex-1 justify-center">
        <div
          className="w-20 h-20 flex items-center justify-center"
          style={{ background:'rgba(255,255,255,0.15)', borderRadius:28, border:'1.5px solid rgba(255,255,255,0.25)', backdropFilter:'blur(20px)' }}
        >
          <Shield size={36} color="white" strokeWidth={1.8} />
        </div>

        <div className="text-center">
          <h1
            className="display font-bold text-white mb-3"
            style={{ fontSize:42, lineHeight:1.1, letterSpacing:'-0.04em' }}
          >
            MoonSafe
          </h1>
          <p
            className="text-[17px] leading-relaxed max-w-[260px]"
            style={{ color:'rgba(255,255,255,0.75)', fontStyle:'italic' }}
          >
            "Có đường lui thì mới dám liều."
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex gap-2 mt-2 flex-wrap justify-center">
          {['Quỹ dự phòng', 'Vault riêng', 'Đầu tư có kỷ luật'].map(f => (
            <span
              key={f}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-full"
              style={{ background:'rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.8)', border:'1px solid rgba(255,255,255,0.2)' }}
            >
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Bottom: CTA */}
      <div className="w-full flex flex-col items-center gap-4">
        <button
          onClick={() => login()}
          className="w-full max-w-[320px] py-4 font-semibold text-[16px] rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{ background:'white', color:'var(--accent)', boxShadow:'0 4px 24px rgba(0,0,0,0.25)' }}
        >
          Đăng nhập
        </button>
        <p className="text-[12px] text-center" style={{ color:'rgba(255,255,255,0.45)' }}>
          Email OTP · Google · Ví web3 · Arc Testnet
        </p>
      </div>
    </div>
  )
}
