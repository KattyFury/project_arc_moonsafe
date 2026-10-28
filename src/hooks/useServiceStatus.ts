// What the admin switched (functions/api/status.ts): the agent on/off, transaction cards on/off, and a notice for everybody.
// Polled once a minute; any failure leaves the last known value (the app works the same without it).

import { useEffect, useState } from 'react'

export interface ServiceStatus { chatEnabled: boolean; cardsEnabled: boolean; notice: string }
const OK: ServiceStatus = { chatEnabled: true, cardsEnabled: true, notice: '' }

export function useServiceStatus(): ServiceStatus {
  const [status, setStatus] = useState<ServiceStatus>(OK)
  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        const r = await fetch('/api/status')
        if (!r.ok) return
        const d = await r.json() as Partial<ServiceStatus>
        if (live) setStatus({ chatEnabled: d.chatEnabled !== false, cardsEnabled: d.cardsEnabled !== false, notice: typeof d.notice === 'string' ? d.notice : '' })
      } catch { /* keep the last value */ }
    }
    void load()
    const id = setInterval(() => { void load() }, 60_000)
    return () => { live = false; clearInterval(id) }
  }, [])
  return status
}
