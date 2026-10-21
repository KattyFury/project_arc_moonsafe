import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { useAgent } from '@/hooks/useAgent'

interface ChatScreenProps {
  onProfileSaved?: () => void
  onError?: (msg: string | null) => void
}

function renderContent(text: string): React.ReactNode {
  const clean = text.replace(/<profile>[\s\S]*?<\/profile>/g, '').trim()
  return clean.split('\n').map((line, i, arr) => {
    const parts = line.split(/\*\*(.*?)\*\*/g)
    return (
      <span key={i}>
        {parts.map((p, j) => j % 2 === 1 ? <strong key={j}>{p}</strong> : p)}
        {i < arr.length - 1 && <br />}
      </span>
    )
  })
}

export function ChatScreen({ onProfileSaved: _p, onError }: ChatScreenProps) {
  const { messages, sendMessage, loading } = useAgent()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    onError?.(null)
    try { await sendMessage(text) }
    catch (e) { onError?.(e instanceof Error ? e.message : 'Lỗi gửi tin nhắn') }
    inputRef.current?.focus()
  }, [input, loading, sendMessage, onError])

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() }
  }, [handleSend])

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ background:'var(--bg)' }}>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <div
            className="rounded-2xl p-4 text-center mx-auto max-w-[280px] mt-8"
            style={{ background:'rgba(30,109,247,0.06)', border:'1px dashed rgba(30,109,247,0.2)' }}
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
              style={{ background:'linear-gradient(135deg,#0F3DB2,#1E6DF7)' }}
            >
              <span className="display font-bold text-white text-lg">M</span>
            </div>
            <p className="font-semibold text-[14px] mb-1" style={{ color:'var(--ink)' }}>
              Xin chào!
            </p>
            <p className="text-[13px] leading-relaxed" style={{ color:'var(--subtle)' }}>
              Mình sẽ hỏi để hiểu tình hình tài chính của bạn và giúp lập quỹ dự phòng.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2 items-end ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mb-[2px]"
                style={{ background:'linear-gradient(135deg,#0F3DB2,#1E6DF7)' }}
              >
                <span className="display font-bold text-white text-[11px]">M</span>
              </div>
            )}
            <div
              className="max-w-[78%] px-4 py-3 text-[14px] leading-relaxed"
              style={msg.role === 'user' ? {
                background:'var(--accent)',
                color:'white',
                borderRadius:'18px 18px 4px 18px',
              } : {
                background:'white',
                color:'var(--ink)',
                border:'1px solid var(--border)',
                borderRadius:'18px 18px 18px 4px',
                boxShadow:'0 1px 4px rgba(0,0,0,0.06)',
              }}
            >
              {renderContent(msg.content)}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2 items-end justify-start">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background:'linear-gradient(135deg,#0F3DB2,#1E6DF7)' }}
            >
              <span className="display font-bold text-white text-[11px]">M</span>
            </div>
            <div
              className="px-4 py-3"
              style={{ background:'white', border:'1px solid var(--border)', borderRadius:'18px 18px 18px 4px' }}
            >
              <div className="dot-typing flex gap-1">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div
        className="flex-shrink-0 flex gap-3 items-center px-4 py-3"
        style={{ background:'white', borderTop:'1px solid var(--border)' }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Nhắn với agent…"
          className="flex-1 px-4 text-[15px] outline-none"
          style={{
            height:44, borderRadius:22,
            background:'var(--surface-muted)',
            border:'1px solid var(--border)',
            color:'var(--ink)',
          }}
        />
        <button
          onClick={() => { void handleSend() }}
          disabled={loading || !input.trim()}
          className="flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
          style={{ width:44, height:44, borderRadius:22, background:'var(--accent)', color:'white', flexShrink:0 }}
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  )
}
