'use client'

import { useState, useEffect, useRef } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import ReactMarkdown from 'react-markdown'

type Message = { role: 'user' | 'assistant'; content: string }

function AdvisorMarkdown({ text }: { text: string }) {
  return (
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
      }}
    >
      {text}
    </ReactMarkdown>
  )
}

export default function RadgivarePage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createSupabaseClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoadingHistory(false); return }
      supabase.from('hemkoll_advisor_sessions').select('messages').eq('user_id', user.id).single()
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
    if (!msg || loading) return
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })
      const data = await res.json()
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠ ${data.error ?? 'Något gick fel'}` }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠ Nätverksfel' }])
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="border-b border-edge bg-bg flex-shrink-0">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <span className="text-2xl">💬</span>
          <div>
            <div className="font-semibold text-sm">Rådgivare</div>
            <div className="text-muted text-xs">Frågar utifrån vad som faktiskt är loggat om huset</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col gap-4">
          {!loadingHistory && messages.length === 0 && (
            <div className="text-center py-10">
              <div className="text-4xl mb-3">🏡</div>
              <div className="font-medium mb-1">Vad kan jag hjälpa dig med?</div>
              <p className="text-muted text-sm">T.ex. &quot;Vad är mest värt att investera i för att sänka uppvärmningskostnaden?&quot;</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              m.role === 'user' ? 'bg-accent text-bg self-end' : 'bg-card border border-edge text-fg self-start'
            }`}>
              {m.role === 'user' ? m.content : <AdvisorMarkdown text={m.content} />}
            </div>
          ))}
          {loading && (
            <div className="bg-card border border-edge rounded-2xl px-4 py-2.5 self-start text-muted text-sm">
              Tänker...
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-edge bg-bg flex-shrink-0">
        <div className="max-w-2xl mx-auto p-4 flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Fråga om huset..."
            rows={1}
            className="flex-1 bg-card border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent resize-none"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="bg-accent text-bg text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            Skicka
          </button>
        </div>
      </div>
    </div>
  )
}
