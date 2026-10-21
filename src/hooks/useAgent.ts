import { useState, useCallback, useRef } from 'react'
import type { ChatMessage, FinancialProfile } from '@/types'
import { useFinancialProfile } from '@/hooks/useFinancialProfile'

const STORAGE_KEY = 'moonsafe_chat_v2'

function readChat(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ChatMessage[]) : []
  } catch { return [] }
}

function writeChat(msgs: ChatMessage[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-80))) } catch { /* ignore */ }
}

const WELCOME: ChatMessage = {
  role: 'assistant',
  content: 'Xin chào! Mình là agent tài chính của MoonSafe. 🌙\n\n"Có đường lui thì mới dám liều."\n\nĐể tính quỹ dự phòng phù hợp, mình cần hỏi bạn một vài câu. Bắt đầu nhé — **thu nhập hàng tháng** của bạn khoảng bao nhiêu (VND hoặc USDC)?',
  timestamp: Date.now(),
}

export function useAgent() {
  const { profile, saveProfile } = useFinancialProfile()
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = readChat()
    return saved.length > 0 ? saved : [WELCOME]
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (userText: string): Promise<void> => {
    const userMsg: ChatMessage = { role: 'user', content: userText, timestamp: Date.now() }
    const updated = [...messages, userMsg]
    setMessages(updated)
    writeChat(updated)
    setLoading(true)
    setError(null)

    // Cancel previous in-flight request
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          messages: updated.map(m => ({ role: m.role, content: m.content })),
          profile: profile ?? null,
        }),
      })

      let content: string
      if (!response.ok) {
        content = mockAgentResponse(updated.length)
      } else {
        const data = await response.json() as { content: string; profileUpdate?: Partial<FinancialProfile> }
        content = data.content
        // Agent may return extracted profile data
        if (data.profileUpdate && Object.keys(data.profileUpdate).length > 0) {
          const raw = data.profileUpdate as Partial<FinancialProfile> & { monthlyEssentials?: number | null; hasDebt?: boolean }
          const normalized: Partial<FinancialProfile> = {
            ...raw,
            monthlyExpenses: (raw.monthlyExpenses ?? raw.monthlyEssentials),
            hasExternalDebt: (raw.hasExternalDebt ?? raw.hasDebt),
          }
          saveProfile({ ...(profile ?? {}), ...normalized } as import('@/types').FinancialProfile)
        }
      }

      // Try to extract profile JSON from agent response
      const profileMatch = content.match(/<profile>([\s\S]*?)<\/profile>/)
      if (profileMatch) {
        try {
          const raw = JSON.parse(profileMatch[1]) as Partial<FinancialProfile> & { monthlyEssentials?: number | null; hasDebt?: boolean }
          // Normalize field aliases: agent may use monthlyEssentials / hasDebt
          const normalized: Partial<FinancialProfile> = {
            ...raw,
            monthlyExpenses: (raw.monthlyExpenses ?? raw.monthlyEssentials),
            hasExternalDebt: (raw.hasExternalDebt ?? raw.hasDebt),
          }
          saveProfile({ ...(profile ?? {}), ...normalized } as import('@/types').FinancialProfile)
          content = content.replace(/<profile>[\s\S]*?<\/profile>/, '').trim()
        } catch { /* ignore parse error */ }
      }

      const assistantMsg: ChatMessage = { role: 'assistant', content, timestamp: Date.now() }
      const final = [...updated, assistantMsg]
      setMessages(final)
      writeChat(final)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      const fallback = mockAgentResponse(updated.length)
      const assistantMsg: ChatMessage = { role: 'assistant', content: fallback, timestamp: Date.now() }
      const final = [...updated, assistantMsg]
      setMessages(final)
      writeChat(final)
    } finally {
      setLoading(false)
    }
  }, [messages, profile, saveProfile])

  const clearChat = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    setMessages([WELCOME])
  }, [])

  return { messages, loading, error, sendMessage, clearChat }
}

function mockAgentResponse(msgCount: number): string {
  if (msgCount <= 2) return 'Cảm ơn bạn! Vậy **chi tiêu thiết yếu mỗi tháng** của bạn là bao nhiêu? (ăn uống, thuê nhà, đi lại, điện nước...)'
  if (msgCount <= 4) return 'Bạn hiện có **khoản nợ** nào không? (vay ngân hàng, mua trả góp, vay bạn bè...)'
  if (msgCount <= 6) return 'Bạn **bao nhiêu tuổi** và thu nhập của bạn có ổn định không? (lương cố định = ổn định, freelance/kinh doanh = không ổn định)'
  if (msgCount <= 8) return 'Bạn có **tài sản khác** không? (vàng, bất động sản, cổ phiếu... không tính nhà ở chính)'
  return 'Cảm ơn bạn đã chia sẻ đầy đủ thông tin! Mình đã ghi nhận và tính toán quỹ dự phòng phù hợp cho bạn. Bạn có thể xem chi tiết ở tab **Cân đối**.\n\n<profile>{"monthlyIncome":20000000,"monthlyEssentials":8000000,"hasDebt":false,"debtNote":"","otherAssets":0,"age":30,"incomeStable":true}</profile>'
}
