'use client'

import { useState, useRef, useEffect } from 'react'
import { fmtSpeedOrPace } from '@/lib/sport'

type Activity = {
  id: string
  strava_id: number
  sport_type: string
  name: string
  distance: number
  moving_time: number
  average_heartrate?: number | null
  max_heartrate?: number | null
  average_watts?: number | null
  start_date: string
}

type Message = { role: 'user' | 'assistant'; content: string }

export default function FeedbackDrawer({ activity }: { activity: Activity }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [initiated, setInitiated] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(msg: string) {
    if (!msg.trim() || loading) return

    const newMessages: Message[] = [...messages, { role: 'user', content: msg }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachId: 'roddcoach',
          message: msg,
          sport: activity.sport_type,
        }),
      })
      const data = await res.json()
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Kunde inte nå coachen just nu. Kontrollera att API-nyckeln är konfigurerad under Profil.' }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Nätverksfel. Försök igen.' }])
    }
    setLoading(false)
  }

  async function openAndAsk() {
    setOpen(true)
    if (!initiated) {
      setInitiated(true)
      const speedOrPace = fmtSpeedOrPace(activity.sport_type, activity.distance, activity.moving_time)

      let zoneStr = ''
      if (activity.strava_id >= 0) {
        try {
          const res = await fetch(`/api/activities/${activity.id}/garmin-zones`)
          const data = await res.json()
          const zones: { zoneNumber: number; secsInZone: number }[] | null = data.zones
          if (zones?.length) {
            const total = zones.reduce((s, z) => s + z.secsInZone, 0)
            if (total > 0) {
              zoneStr = `, pulszoner: ${zones
                .sort((a, b) => a.zoneNumber - b.zoneNumber)
                .map(z => `Z${z.zoneNumber} ${Math.round((z.secsInZone / total) * 100)}%`)
                .join(' ')}`
            }
          }
        } catch {
          // zones are a bonus for the coach's assessment — skip silently if unavailable
        }
      }

      const parts = [
        `Analysera mitt senaste ${activity.sport_type}-pass: "${activity.name}".`,
        `Distans: ${(activity.distance / 1000).toFixed(1)} km,`,
        `Tid: ${Math.floor(activity.moving_time / 60)} min`,
        speedOrPace ? `, ${speedOrPace.label}: ${speedOrPace.value}` : '',
        activity.average_heartrate ? `, snitt-HR: ${Math.round(activity.average_heartrate)} bpm` : '',
        activity.max_heartrate ? `, max-HR: ${Math.round(activity.max_heartrate)} bpm` : '',
        activity.average_watts ? `, snitt-watt: ${Math.round(activity.average_watts)}W` : '',
        zoneStr,
        `. Ge konkret feedback på passet och tre fokuspunkter inför nästa pass.`,
      ]
      sendMessage(parts.join(''))
    }
  }

  return (
    <>
      <button
        onClick={openAndAsk}
        className="w-full bg-accent text-bg font-semibold py-3.5 rounded-xl hover:opacity-90 transition-opacity text-sm"
      >
        Begär feedback från tränaren
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col">
          <div
            className="flex-1 bg-black/70"
            onClick={() => setOpen(false)}
          />
          <div className="bg-card border-t border-edge rounded-t-3xl flex flex-col"
            style={{ maxHeight: '85vh' }}>

            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-edge rounded-full" />
            </div>

            {/* Header */}
            <div className="px-5 py-3 border-b border-edge flex items-center justify-between flex-shrink-0">
              <div>
                <div className="font-semibold text-fg text-sm">Din coach</div>
                <div className="text-xs text-muted truncate max-w-[220px]">{activity.name}</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center text-muted hover:text-fg text-xl"
              >
                ×
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-accent text-bg'
                      : 'bg-bg border border-edge text-fg'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-bg border border-edge rounded-2xl px-4 py-3">
                    <div className="flex gap-1 items-center">
                      {[0, 150, 300].map(delay => (
                        <span
                          key={delay}
                          className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce"
                          style={{ animationDelay: `${delay}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-edge flex gap-2 flex-shrink-0">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
                placeholder="Ställ en följdfråga..."
                className="flex-1 bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                className="bg-accent text-bg font-medium px-4 py-2.5 rounded-xl disabled:opacity-40 text-sm flex-shrink-0"
              >
                Skicka
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
