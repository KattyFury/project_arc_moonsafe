// Chat with the MoonSafe agent (/api/chat). History lives in localStorage and is synced
// to /api/userdata (src/lib/cloud.ts) so it follows the Privy account.
// What the agent recorded comes back as a list of operations (src/lib/profile.ts ProfileOp),
// applied to the profile in one save; there is no form to confirm.
// If the agent is down we say so — no canned replies, no made-up profile.

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@/types'
import { cloudSave } from '@/lib/cloud'
import { readOps, type ProfileOp } from '@/lib/profile'

const STORAGE_KEY = 'moonsafe_chat_v2'
const MAX_KEEP = 80
const MAX_SEND = 30

/** Greeting shown to someone who already saved a declaration (UI only, never sent to the model). */
export const WELCOME_BACK = 'Welcome back! I still have the finances you shared, you can review them in the **Balance** tab. If anything has changed, just tell me and I will update it.\n\nWhat shall we look at today: spending, your emergency fund or investing?'

export const WELCOME: ChatMessage = {
  role: 'assistant',
  content: 'Hi! I am MoonSafe\u2019s personal finance advisor.\n\nWe go step by step: get clear on your cash flow, build an **emergency fund** in USDC for the unexpected, then invest.\n\nNo forms to fill in. Share as much as you like and I will advise from there. Where would you like to start: spending, saving or investing?',
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
  /** What the agent recorded this turn (profile, holdings, debts, incomes, expenses), applied in one save. */
  onOps: (ops: ProfileOp[]) => void
  onDcaStop: () => void
  /** UI actions the agent asked for (open a screen with a prefilled amount). */
  onActions?: (actions: AgentAction[]) => void
}

export interface AgentAction {
  type: 'prepare_deposit' | 'prepare_withdraw' | 'prepare_buy_cirbtc' | 'propose_dca' | 'open_screen' | 'show_allocation' | 'show_cashflow'
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
      const data = await res.json().catch(() => null) as { content?: string; error?: string; ops?: unknown; dcaStop?: boolean; actions?: AgentAction[] } | null
      if (!res.ok || !data?.content) throw new Error(data?.error ?? `HTTP ${res.status}`)

      const content = data.content.trim()
      const ops = readOps(data.ops)
      if (ops.length) hooksRef.current.onOps(ops)
      if (data.dcaStop) hooksRef.current.onDcaStop()
      if (data.actions?.length) hooksRef.current.onActions?.(data.actions)

      const final = [...history, { role: 'assistant' as const, content, timestamp: Date.now() }]
      setMessages(final)
      writeChat(final)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      const detail = (e as Error).message
      setMessages([...history, {
        role: 'assistant',
        content: `The agent cannot reply right now (${detail}). Your message is kept, please try again in a few minutes.`,
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
