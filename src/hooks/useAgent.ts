// Chat with the MoonSafe agent (/api/chat). History lives in localStorage and is synced
// to /api/userdata (src/lib/cloud.ts) so it follows the Privy account.
// Values the agent extracts (profileUpdate / <profile>…</profile>) are handed to
// onProfileDraft and saved to the profile in this browser; there is no form to confirm.
// If the agent is down we say so — no canned replies, no made-up profile.

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@/types'
import { cloudSave } from '@/lib/cloud'

const STORAGE_KEY = 'moonsafe_chat_v2'
const MAX_KEEP = 80
const MAX_SEND = 30

/** Greeting shown to someone who already saved a declaration (UI only, never sent to the model). */
export const WELCOME_BACK = 'Chào bạn quay lại! Mình vẫn nhớ tình hình tài chính bạn đã kể, bạn xem lại ở tab **Cân đối** nhé. Có gì thay đổi cứ nói, mình cập nhật ngay.\n\nHôm nay mình bàn chuyện gì đây: chi tiêu, quỹ dự phòng hay đầu tư?'

export const WELCOME: ChatMessage = {
  role: 'assistant',
  content: 'Chào bạn! Mình là chuyên gia tài chính cá nhân của MoonSafe.\n\nMình đồng hành cùng bạn từng bước: nắm rõ thu chi, để dành một **quỹ dự phòng** bằng USDC cho những lúc bất ngờ, rồi mới tính chuyện đầu tư.\n\nBạn không cần khai báo gì cả, cứ kể đến đâu mình tư vấn đến đó. Bạn đang muốn lo chuyện gì trước: chi tiêu, để dành hay đầu tư?',
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
  const keep = msgs.filter(m => !m.error).slice(-MAX_KEEP)
  hydrateChat(keep)
  cloudSave({ chat: keep })
}

/** The stored history (no greeting added), for the first upload to the server. */
export function readLocalChat(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ChatMessage[]) : []
  } catch { return [] }
}

/** Replace the local history (no upload); null removes it. */
export function hydrateChat(msgs: ChatMessage[] | null) {
  try { if (msgs) localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs)); else localStorage.removeItem(STORAGE_KEY) } catch { /* storage blocked */ }
}

export function clearChatStorage() {
  hydrateChat(null)
  cloudSave({ chat: null })
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
        content: `Agent đang không trả lời được (${detail}). Tin nhắn của bạn vẫn được giữ, thử gửi lại sau ít phút nhé.`,
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
