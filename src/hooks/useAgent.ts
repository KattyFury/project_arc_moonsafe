// Chat with the MoonSafe agent (/api/chat). History lives in localStorage.
// The agent never saves anything by itself: values it extracts (<profile>…</profile>)
// go to the declaration card as a draft, and the user taps "Lưu khai báo".
// If the agent is down we say so — no canned replies, no made-up profile.

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@/types'

const STORAGE_KEY = 'moonsafe_chat_v2'
const MAX_KEEP = 80
const MAX_SEND = 30

/** Greeting shown to someone who already saved a declaration (UI only, never sent to the model). */
export const WELCOME_BACK = 'Chào bạn quay lại! Mình đã có khai báo tài chính của bạn, xem hoặc sửa ở tab **Cân đối**.\n\nBạn muốn hỏi gì về quỹ dự phòng hay đầu tư?'

export const WELCOME: ChatMessage = {
  role: 'assistant',
  content: 'Xin chào! Mình là agent của MoonSafe.\n\n"Nên đầu tư nhưng phải có đường lui." Trước khi đầu tư, mình giúp bạn lập **quỹ dự phòng** bằng USDC.\n\nBắt đầu nhé: **thu nhập hàng tháng** của bạn khoảng bao nhiêu?',
  timestamp: 0,
}

function readChat(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? (JSON.parse(raw) as ChatMessage[]) : []
    return list.length ? list : [WELCOME]
  } catch { return [WELCOME] }
}

function writeChat(msgs: ChatMessage[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.filter(m => !m.error).slice(-MAX_KEEP))) } catch { /* storage blocked */ }
}

export function clearChatStorage() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* storage blocked */ }
}

export interface AgentHooks {
  /** Context the agent sees (declared numbers, fund progress, DCA). */
  getContext: () => Record<string, unknown>
  onProfileDraft: (draft: Record<string, unknown>) => void
  onDcaStop: () => void
  /** UI actions the agent asked for (open a screen with a prefilled amount). */
  onActions?: (actions: AgentAction[]) => void
}

export interface AgentAction {
  type: 'prepare_deposit' | 'prepare_withdraw' | 'prepare_buy_cirbtc' | 'propose_dca' | 'open_screen'
  amount?: { amount: number; currency: 'VND' | 'USDC' }
  intervalDays?: number
  screen?: 'fund' | 'invest' | 'balance' | 'menu'
}

export function useAgent(hooks: AgentHooks) {
  const [messages, setMessages] = useState<ChatMessage[]>(readChat)
  const [loading, setLoading] = useState(false)
  const hooksRef = useRef(hooks)
  useLayoutEffect(() => { hooksRef.current = hooks })
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() }
    const history = [...messages.filter(m => !m.error), userMsg]
    setMessages(history)
    writeChat(history)
    setLoading(true)

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          // The greeting (timestamp 0) is UI-only: sending it made the model re-ask questions already answered.
          messages: history.filter(m => m.timestamp !== 0).slice(-MAX_SEND).map(m => ({ role: m.role, content: m.content })),
          context: hooksRef.current.getContext(),
        }),
      })
      const data = await res.json().catch(() => null) as { content?: string; error?: string; profileUpdate?: Record<string, unknown> | null; dcaStop?: boolean; actions?: AgentAction[] } | null
      if (!res.ok || !data?.content) throw new Error(data?.error ?? `HTTP ${res.status}`)

      let content = data.content
      if (data.profileUpdate) hooksRef.current.onProfileDraft(data.profileUpdate)
      if (data.dcaStop) hooksRef.current.onDcaStop()
      if (data.actions?.length) hooksRef.current.onActions?.(data.actions)
      const pm = content.match(/<profile>([\s\S]*?)<\/profile>/)
      if (pm) {
        try { hooksRef.current.onProfileDraft(JSON.parse(pm[1]) as Record<string, unknown>) } catch { /* ignore bad JSON */ }
      }
      if (/<dca\s+action="stop"\s*\/>/.test(content)) hooksRef.current.onDcaStop()
      content = content.replace(/<profile>[\s\S]*?<\/profile>/g, '').replace(/<dca[^>]*\/>/g, '').trim()

      const final = [...history, { role: 'assistant' as const, content, timestamp: Date.now() }]
      setMessages(final)
      writeChat(final)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      const detail = (e as Error).message
      setMessages([...history, {
        role: 'assistant',
        content: `Agent đang không trả lời được (${detail}). Tin nhắn của bạn vẫn được giữ, thử gửi lại sau nhé. Bạn vẫn có thể tự điền thẻ khai báo.`,
        timestamp: Date.now(),
        error: true,
      }])
    } finally {
      setLoading(false)
    }
  }, [messages])

  const clearChat = useCallback(() => {
    clearChatStorage()
    setMessages([WELCOME])
  }, [])

  return { messages, loading, sendMessage, clearChat }
}
