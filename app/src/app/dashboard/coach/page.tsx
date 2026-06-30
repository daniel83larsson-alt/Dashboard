'use client'

import { useState, useEffect, useRef } from 'react'
import { createSupabaseClient } from '@/lib/supabase'

const COACHES = [
  { id: 'roddcoach', name: 'Roddcoachen', emoji: '🚣', desc: 'Teknik & träning' },
  { id: 'dataanalytiker', name: 'Analytikern', emoji: '📊', desc: 'Data & trender' },
  { id: 'aterhamtning', name: 'Återhämtning', emoji: '🌙', desc: 'Vila & recovery' },
  { id: 'nutritionist', name: 'Nutritionisten', emoji: '🥗', desc: 'Kost & energi' },
  { id: 'rorlighet', name: 'Rörlighet', emoji: '🤸', desc: 'Stretching & mobilitet' },
  { id: 'vetenskap', name: 'Vetenskaparen', emoji: '🔬', desc: 'Fysiologi & forskning' },
  { id: 'hejarklacken', name: 'Hejarklacken', emoji: '🏆', desc: 'Motivation · VETO', veto: true },
]

type Message = { role: 'user' | 'assistant'; content: string }

export default function CoachPage() {
  const [activeId, setActiveId] = useState('roddcoach')
  const [byCoach, setByCoach] = useState<Record<string, Message[]>>({})
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const active = COACHES.find(c => c.id === activeId) ?? COACHES[0]
  const messages = byCoach[activeId] ?? []

  useEffect(() => {
    if (byCoach[activeId] !== undefined) return
    setLoadingHistory(true)
    const supabase = createSupabaseClient()
    supabase
      .from('coach_sessions')
      .select('messages')
      .eq('coach_id', activeId)
      .single()
      .then(({ data }) => {
        setByCoach(prev => ({
          ...prev,
          [activeId]: (data?.messages as Message[]) ?? [],
        }))
        setLoadingHistory(false)
      })
  }, [activeId, byCoach])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send() {
    const msg = input.trim()
    if (!msg || loading) return

    const updated: Message[] = [...messages, { role: 'user', content: msg }]
    setByCoach(prev => ({ ...prev, [activeId]: updated }))
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachId: activeId, message: msg, sport: 'Rowing' }),
      })
      const data = await res.json()
      const reply = data.reply ?? 'Kunde inte nå coachen. Kontrollera att API-nyckeln är inlagd under Profil.'
      setByCoach(prev => ({
        ...prev,
        [activeId]: [...updated, { role: 'assistant', content: reply }],
      }))
    } catch {
      setByCoach(prev => ({
        ...prev,
        [activeId]: [...updated, { role: 'assistant', content: 'Nätverksfel. Försök igen.' }],
      }))
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col h-[100dvh] md:h-screen pb-20 md:pb-0">
      {/* Coach selector */}
      <div className="border-b border-edge bg-bg flex-shrink-0">
        <div className="px-4 pt-4 pb-0">
          <h1 className="text-lg font-semibold mb-3">Coach</h1>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-hide">
          {COACHES.map(c => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border transition-colors min-w-[72px] ${
                activeId === c.id
                  ? 'border-accent bg-accent/10'
                  : 'border-edge bg-card'
              }`}
            >
              <span className="text-xl leading-none">{c.emoji}</span>
              <span className={`text-[11px] font-medium text-center leading-tight ${
                activeId === c.id ? 'text-accent' : 'text-muted'
              }`}>
                {c.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
        {loadingHistory && (
          <div className="flex justify-center py-8">
            <div className="text-muted text-sm">Laddar...</div>
          </div>
        )}

        {!loadingHistory && messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center min-h-0">
            <div className="text-center py-12">
              <div className="text-5xl mb-4">{active.emoji}</div>
              <div className="font-semibold text-fg text-lg">{active.name}</div>
              <div className="text-muted text-sm mt-1">{active.desc}</div>
              {active.veto && (
                <div className="text-xs text-accent mt-2 bg-accent/10 px-3 py-1 rounded-full inline-block">
                  Kan stoppa dåliga idéer med VETO
                </div>
              )}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <span className="text-xl flex-shrink-0 mb-1">{active.emoji}</span>
            )}
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-accent text-bg rounded-br-sm'
                : 'bg-card border border-edge text-fg rounded-bl-sm'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-end gap-2">
            <span className="text-xl">{active.emoji}</span>
            <div className="bg-card border border-edge rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1 items-center">
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

      {/* Input */}
      <div className="p-4 border-t border-edge bg-bg flex gap-2 flex-shrink-0">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={`Fråga ${active.name}...`}
          className="flex-1 bg-card border border-edge rounded-xl px-4 py-3 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="bg-accent text-bg font-semibold px-5 py-3 rounded-xl disabled:opacity-40 text-sm flex-shrink-0 transition-opacity"
        >
          Skicka
        </button>
      </div>
    </div>
  )
}
