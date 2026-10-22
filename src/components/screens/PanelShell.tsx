// Popup that covers the chat area (rows 2–9). The chat input stays visible below.

import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { IconButton } from '@/components/ui/kit'

export function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 bg-ground flex flex-col" role="dialog" aria-label={title}>
      <div className="shrink-0 flex items-center justify-between gap-2 pb-2">
        <h2 className="text-app-title-screen text-ink">{title}</h2>
        <IconButton icon={X} label="Đóng, quay lại chat" onClick={onClose} className="-mr-3" />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-4 pb-2 px-1 -mx-1">{children}</div>
    </div>
  )
}
