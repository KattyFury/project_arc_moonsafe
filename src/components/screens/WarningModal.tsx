// Screen 3 — shown on every login, "Tôi hiểu" to continue.

import { AlertTriangle } from 'lucide-react'
import { Button, Modal } from '@/components/ui/kit'

const POINTS = [
  'Chỉ để tham khảo, không phải tư vấn đầu tư.',
  'Không cam kết sinh lời. Tài sản đầu tư có thể giảm sâu.',
  'Đang chạy trên Arc Testnet: USDC thử nghiệm, không có giá trị thật.',
]

export function WarningModal({ onAcknowledge }: { onAcknowledge: () => void }) {
  return (
    <Modal title="Lưu ý quan trọng">
      <ul className="flex flex-col gap-2">
        {POINTS.map(p => (
          <li key={p} className="flex gap-2 items-start">
            <AlertTriangle size={20} className="shrink-0 mt-[2px] text-yellow" />
            <span className="text-app-note text-grey">{p}</span>
          </li>
        ))}
      </ul>
      <Button block onClick={onAcknowledge}>Tôi hiểu</Button>
    </Modal>
  )
}
