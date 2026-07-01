'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type AgentInsights = {
  data: string
  recovery: string
  mental: string
  strength: string
  mobility: string
  summary: string
}

type Insight = {
  generatedAt: string
  stats: { sessions: number; thisWeek: number; thisMonth: number; totalKm: number; pr30: string | null }
  agents: AgentInsights
}

type Props = { savedInsight: Insight | null; activityCount?: number }

const SPECIALISTS: { key: keyof Omit<AgentInsights, 'summary'>; label: string; icon: string }[] = [
  { key: 'data',     label: 'Data',        icon: '📊' },
  { key: 'recovery', label: 'Återhämtning', icon: '💤' },
  { key: 'mental',   label: 'Mental',      icon: '🧠' },
  { key: 'strength', label: 'Styrka',      icon: '💪' },
  { key: 'mobility', label: 'Rörlighet',   icon: '🤸' },
]

function shortTake(text: string): string {
  const clean = text.replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim()
  const match = clean.match(/^.*?[.!?](\s|$)/)
  const take = (match ? match[0] : clean).trim()
  return take.length > 160 ? take.slice(0, 157).trimEnd() + '…' : take
}

export default function InsightsSummary({ savedInsight, activityCount = 0 }: Props) {
  const [insight, setInsight] = useState<Insight | null>(savedInsight)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function generate() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/insights/generate', { method: 'POST' })
      const data = await res.json()
      if (data.insight) {
        setInsight(data.insight)
        router.refresh()
      } else {
        setError(data.error ?? 'Något gick fel')
      }
    } catch {
      setError('Nätverksfel')
    }
    setLoading(false)
  }

  const age = insight ? Math.floor((Date.now() - new Date(insight.generatedAt).getTime()) / 3600000) : null

  return (
    <div className="bg-card border border-edge rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-fg">Insikter från teamet</div>
          {insight && (
            <div className="text-muted text-xs mt-0.5">
              Uppdaterad {age === 0 ? 'precis' : `${age}h sedan`}
            </div>
          )}
        </div>
        <button
          onClick={generate}
          disabled={loading || activityCount === 0}
          className="bg-accent text-bg text-xs font-semibold px-3 py-2 rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity flex items-center gap-2 flex-shrink-0"
        >
          {loading ? (
            <>
              <span className="w-3 h-3 border-2 border-bg/40 border-t-bg rounded-full animate-spin" />
              Analyserar…
            </>
          ) : (
            `${insight ? 'Uppdatera' : 'Hämta'} insikter`
          )}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

      {!insight && !loading && (
        <p className="text-muted text-sm">Klicka för att låta hela tränarteamet analysera din hälsodata.</p>
      )}

      {insight && (
        <div className="space-y-3">
          <ul className="space-y-1.5">
            {SPECIALISTS.map(({ key, label, icon }) => {
              const text = insight.agents[key]
              if (!text) return null
              return (
                <li key={key} className="flex gap-2 text-xs leading-relaxed">
                  <span className="flex-shrink-0">{icon}</span>
                  <span className="text-fg/90">
                    <strong className="text-fg">{label}:</strong> {shortTake(text)}
                  </span>
                </li>
              )
            })}
          </ul>

          {insight.agents.summary && (
            <div className="border-t border-edge pt-3">
              <div className="text-xs text-accent font-medium mb-1">🚣 Huvudcoachen</div>
              <p className="text-sm text-fg/90 leading-relaxed line-clamp-3 lg:line-clamp-none">
                {insight.agents.summary.replace(/[#*_`>]/g, '').trim()}
              </p>
            </div>
          )}

          <Link href="/dashboard/insikter" className="inline-block text-xs text-accent hover:underline">
            Se hela analysen →
          </Link>
        </div>
      )}
    </div>
  )
}
