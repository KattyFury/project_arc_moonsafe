import { AlertTriangle } from 'lucide-react'

interface WarningModalProps { onAcknowledge: () => void }

export function WarningModal({ onAcknowledge }: WarningModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-5"
      style={{ background:'rgba(10,36,112,0.72)', backdropFilter:'blur(12px)' }}
    >
      <div
        className="w-full max-w-[340px] p-6 flex flex-col gap-5"
        style={{ background:'white', borderRadius:24, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 flex items-center justify-center flex-shrink-0"
            style={{ background:'rgba(245,179,1,0.12)', borderRadius:16 }}
          >
            <AlertTriangle size={20} style={{ color:'#F5B301' }} />
          </div>
          <p className="font-semibold text-[17px]" style={{ color:'var(--ink)' }}>Lưu ý quan trọng</p>
        </div>

        <ul className="flex flex-col gap-3">
          {[
            'Chỉ để tham khảo, không phải tư vấn đầu tư.',
            'Không có cam kết sinh lời. Giá trị tài sản có thể giảm sâu.',
            'Đang chạy trên Arc Testnet — USDC thử nghiệm, không có giá trị thật.',
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-[1px] text-[11px] font-bold"
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
          className="w-full py-3.5 rounded-2xl font-semibold text-[15px] text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{ background:'var(--accent)' }}
        >
          Tôi hiểu
        </button>
      </div>
    </div>
  )
}
