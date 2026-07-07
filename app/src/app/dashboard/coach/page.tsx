'use client'

import { useState, useEffect, useRef } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import ReactMarkdown from 'react-markdown'

type Message = { role: 'user' | 'assistant'; content: string; warning?: boolean }

export default function CoachPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [locked, setLocked] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const supabase = createSupabaseClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoadingHistory(false); return }
      supabase
        .from('coach_sessions')
        .select('messages')
        .eq('user_id', user.id)
        .eq('coach_id', 'roddcoach')
        .single()
        .then(({ data }) => {
          setMessages((data?.messages as Message[]) ?? [])
          setLoadingHistory(false)
        })
    })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send() {
    const msg = input.trim()
    if (!msg || loading || locked) return

    const updated: Message[] = [...messages, { role: 'user', content: msg }]
    setMessages(updated)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachId: 'roddcoach', message: msg, sport: 'Rowing' }),
      })
      const data = await res.json()
      if (data.blocked) {
        setMessages([...updated, { role: 'assistant', content: data.warning, warning: true }])
        if (data.locked) setLocked(true)
      } else {
        const reply = data.reply || 'Kunde inte nå coachen. Kontrollera att API-nyckeln är inlagd under Profil.'
        setMessages([...updated, { role: 'assistant', content: reply }])
      }
    } catch {
      setMessages([...updated, { role: 'assistant', content: 'Nätverksfel. Försök igen.' }])
    }
    setLoading(false)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }

  return (
    <div className="fixed inset-0 md:left-56 flex flex-col pb-20 md:pb-0">
      {/* Header */}
      <div className="border-b border-edge bg-bg flex-shrink-0">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-lg">🚣</div>
          <div>
            <div className="font-semibold text-fg text-sm">Din coach</div>
            <div className="text-xs text-muted">Träning · teknik · plan</div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0">
      <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col gap-4">
        {loadingHistory && (
          <div className="flex justify-center py-12">
            <div className="text-muted text-sm">Laddar...</div>
          </div>
        )}

        {!loadingHistory && messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center py-12">
              <div className="text-5xl mb-4">🚣</div>
              <div className="font-semibold text-fg text-base">Vad kan jag hjälpa dig med?</div>
              <div className="text-muted text-sm mt-2 max-w-xs">
                Fråga om träningsupplägg, teknik, återhämtning, mål eller veckans plan.
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-accent/15 flex items-center justify-center text-base flex-shrink-0 mb-1">
                {msg.warning ? '⚠️' : '🚣'}
              </div>
            )}
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-accent text-bg rounded-br-sm'
                : msg.warning
                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-bl-sm'
                : 'bg-card border border-edge text-fg rounded-bl-sm'
            }`}>
              {msg.role === 'user' || msg.warning ? (
                msg.content
              ) : (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold text-accent">{children}</strong>,
                    em: ({ children }) => <em className="text-lcd italic">{children}</em>,
                    ul: ({ children }) => <ul className="mb-2 last:mb-0 space-y-1 pl-0 [&>li]:flex [&>li]:gap-2 [&>li]:items-start [&>li]:before:content-['·'] [&>li]:before:text-accent [&>li]:before:flex-shrink-0 [&>li]:before:mt-0.5">{children}</ul>,
                    ol: ({ children }) => <ol className="mb-2 last:mb-0 space-y-1 pl-5 list-decimal marker:text-accent">{children}</ol>,
                    li: ({ children }) => <li className="text-fg leading-relaxed">{children}</li>,
                    h1: ({ children }) => <div className="font-semibold text-fg mb-1 mt-2 first:mt-0">{children}</div>,
                    h2: ({ children }) => <div className="font-semibold text-fg mb-1 mt-2 first:mt-0">{children}</div>,
                    h3: ({ children }) => <div className="font-medium text-muted mb-1 mt-2 first:mt-0 text-xs uppercase tracking-wide">{children}</div>,
                    code: ({ children }) => <code className="bg-bg px-1.5 py-0.5 rounded text-lcd text-xs font-mono">{children}</code>,
                    blockquote: ({ children }) => <blockquote className="border-l-2 border-accent pl-3 text-muted my-2">{children}</blockquote>,
                    hr: () => <hr className="border-edge my-3" />,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-end gap-2">
            <div className="w-7 h-7 rounded-full bg-accent/15 flex items-center justify-center text-base flex-shrink-0">🚣</div>
            <div className="bg-card border border-edge rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1 items-center h-4">
                {[0, 150, 300].map(d => (
                  <span key={d} className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce"
                    style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      </div>

      {/* Input */}
      <div className="border-t border-edge bg-bg flex-shrink-0">
        <div className="max-w-2xl mx-auto p-4 flex gap-2 items-end">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKey}
            disabled={locked}
            placeholder={locked ? 'Kontot är låst' : 'Skriv ett meddelande...'}
            className="flex-1 bg-card border border-edge rounded-xl px-4 py-3 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors resize-none overflow-hidden leading-relaxed disabled:opacity-50"
            style={{ minHeight: '48px' }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim() || locked}
            className="bg-accent text-bg font-semibold px-5 py-3 rounded-xl disabled:opacity-40 text-sm flex-shrink-0 transition-opacity h-12"
          >
            Skicka
          </button>
        </div>
      </div>
    </div>
  )
}
