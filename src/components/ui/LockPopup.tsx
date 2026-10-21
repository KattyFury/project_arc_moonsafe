import { X } from 'lucide-react'

interface LockPopupProps {
  title: string
  message: string
  onClose: () => void
}

export function LockPopup({ title, message, onClose }: LockPopupProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔒</span>
            <h3 className="font-semibold text-slate-800">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100 text-slate-400">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">{message}</p>
        <button
          onClick={onClose}
          className="mt-4 w-full py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium"
        >
          Đã hiểu
        </button>
      </div>
    </div>
  )
}
