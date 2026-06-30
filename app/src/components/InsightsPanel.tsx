'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type AgentInsights = {
  coach: string
  data: string
  recovery: string
  mental: string
  strength: string
}

type Insight = {
  generatedAt: string
  stats: {
    sessions: number
    thisWeek: number
    thisMonth: number
    totalKm: number
    pr30: string | null
  }
  agents: AgentInsights
}

type Props = { savedInsight: Insight | null }

const AGENTS: { key: keyof AgentInsights; label: string; icon: string }[] = [
  { key: 'coach',    label: 'Roddcoach',          icon: '🚣' },
  { key: 'data',     label: 'Dataanalytiker',      icon: '📊' },
  { key: 'recovery', label: 'Återhämtning',        icon: '💤' },
  { key: 'mental',   label: 'Mentalcoach',         icon: '🧠' },
  { key: 'strength', label: 'Styrkecoach',         icon: '💪' },
]

export default function InsightsPanel({ savedInsight }: Props) {
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
  const isStale = age !== null && age >= 24

  return (
    <div className="flex flex-col gap-5">

      {/* Header + button */}
      <div className="flex items-center justify-between">
        <div>
          {insight && (
            <p className="text-muted text-xs mt-0.5">
              {isStale ? '⚠ ' : ''}Uppdaterad {age === 0 ? 'precis' : `${age}h sedan`}
              {isStale && ' · dags att hämta nya'}
            </p>
          )}
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="bg-accent text-bg text-xs font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-3 h-3 border-2 border-bg/40 border-t-bg rounded-full animate-spin" />
              Analyserar...
            </>
          ) : (
            `${insight ? 'Uppdatera' : 'Hämta'} insikter`
          )}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Stats snapshot */}
      {insight && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-card border border-edge rounded-xl p-3">
            <div className="font-mono text-accent text-lg font-bold">{insight.stats.thisWeek}</div>
            <div className="text-muted text-xs">pass denna vecka</div>
          </div>
          <div className="bg-card border border-edge rounded-xl p-3">
            <div className="font-mono text-accent text-lg font-bold">{insight.stats.thisMonth}</div>
            <div className="text-muted text-xs">pass denna månad</div>
          </div>
          <div className="bg-card border border-edge rounded-xl p-3">
            <div className="font-mono text-accent text-lg font-bold">{insight.stats.totalKm} km</div>
            <div className="text-muted text-xs">all time</div>
          </div>
          {insight.stats.pr30 && (
            <div className="bg-card border border-edge rounded-xl p-3">
              <div className="font-mono text-lcd text-sm font-bold leading-tight">{insight.stats.pr30}</div>
              <div className="text-muted text-xs mt-0.5">PB 30 min</div>
            </div>
          )}
        </div>
      )}

      {/* Agent insights */}
      {insight && (
        <div className="flex flex-col gap-3">
          {AGENTS.map(({ key, label, icon }) => {
            const text = insight.agents[key]
            if (!text) return null
            return (
              <div key={key} className="bg-card border border-edge rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{icon}</span>
                  <span className="text-sm font-medium">{label}</span>
                </div>
                <p className="text-sm text-fg/90 leading-relaxed">{text}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {!insight && !loading && (
        <div className="bg-card border border-edge rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <div className="font-medium mb-1">Inga insikter ännu</div>
          <p className="text-muted text-sm">Klicka "Hämta insikter" så analyserar hela tränarteamet din data</p>
        </div>
      )}
    </div>
  )
}
