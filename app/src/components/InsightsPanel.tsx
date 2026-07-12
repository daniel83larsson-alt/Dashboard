'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'

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
  stats: {
    sessions: number
    thisWeek: number
    thisMonth: number
    totalKm: number
    pr30: string | null
  }
  agents: AgentInsights
}

type Props = { savedInsight: Insight | null; activityCount?: number; hasWellness?: boolean }

const SPECIALISTS: { key: keyof Omit<AgentInsights, 'summary'>; label: string; icon: string; role: string }[] = [
  { key: 'data',     label: 'Dataanalytiker',  icon: '📊', role: 'Trender · Mönster · Siffror' },
  { key: 'recovery', label: 'Återhämtning',    icon: '💤', role: 'Hela träningsbilden + hälsodata' },
  { key: 'mental',   label: 'Mentalcoach',     icon: '🧠', role: 'Mindset · Motivation · Verktyg' },
  { key: 'strength', label: 'Styrkecoach',     icon: '💪', role: 'Kompletterande träning · Core' },
  { key: 'mobility', label: 'Rörlighetscoach', icon: '🤸', role: 'Stretching · Mobility · Förebyggande' },
]

function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-accent">{children}</strong>,
        em: ({ children }) => <em className="text-lcd italic">{children}</em>,
        ul: ({ children }) => <ul className="mb-2 last:mb-0 space-y-1 [&>li]:flex [&>li]:gap-2 [&>li]:items-start [&>li]:before:content-['·'] [&>li]:before:text-accent [&>li]:before:flex-shrink-0 [&>li]:before:mt-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 last:mb-0 space-y-1 pl-5 list-decimal marker:text-accent">{children}</ol>,
        li: ({ children }) => <li className="text-fg leading-relaxed">{children}</li>,
        h1: ({ children }) => <div className="font-semibold text-fg mb-1 mt-2 first:mt-0">{children}</div>,
        h2: ({ children }) => <div className="font-semibold text-fg mb-1 mt-2 first:mt-0">{children}</div>,
        h3: ({ children }) => <div className="font-medium text-muted mb-1 mt-1.5 text-xs uppercase tracking-wide">{children}</div>,
      }}
    >
      {text}
    </ReactMarkdown>
  )
}

export default function InsightsPanel({ savedInsight, activityCount = 0, hasWellness = false }: Props) {
  const hasData = activityCount > 0 || hasWellness
  const [insight, setInsight] = useState<Insight | null>(savedInsight)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Date.now() can't be called directly during render (React treats it as
  // impure) — a lazy initializer runs it once outside the render body itself.
  const [now] = useState<number>(() => Date.now())
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

  const age = insight ? Math.floor((now - new Date(insight.generatedAt).getTime()) / 3600000) : null
  const isStale = age !== null && age >= 24

  return (
    <div className="flex flex-col gap-5">

      {/* Header + button */}
      <div className="flex items-center justify-between">
        <div>
          {insight && (
            <p className="text-muted text-xs">
              {isStale ? '⚠ ' : ''}Uppdaterad {age === 0 ? 'precis' : `${age}h sedan`}
              {isStale && ' · dags att hämta nya'}
            </p>
          )}
        </div>
        <button
          onClick={generate}
          disabled={loading || !hasData}
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

      {/* Stats snapshot — frozen at generation time, can drift from the live
          dashboard as new passes sync in. Labeled explicitly so it doesn't
          read as a live, contradicting number. */}
      {insight && (
        <div>
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
          <p className="text-muted text-[10px] mt-1.5">
            Ögonblicksbild vid analysen ({new Date(insight.generatedAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}) — kan skilja sig från Passlogg om du synkat nya pass sen dess
          </p>
        </div>
      )}

      {/* Specialists */}
      {insight && (
        <div className="flex flex-col gap-3">
          <div className="text-xs text-muted uppercase tracking-wider px-0.5">Specialisternas bedömning</div>
          {SPECIALISTS.map(({ key, label, icon, role }) => {
            const text = insight.agents[key]
            if (!text) return null
            return (
              <div key={key} className="bg-card border border-edge rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{icon}</span>
                  <div>
                    <div className="text-sm font-medium text-fg">{label}</div>
                    <div className="text-xs text-muted">{role}</div>
                  </div>
                </div>
                <div className="text-sm text-fg/90 leading-relaxed">
                  <Markdown text={text} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Head coach summary */}
      {insight?.agents.summary && (
        <div className="bg-card border border-accent/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🚣</span>
            <div>
              <div className="text-sm font-semibold text-fg">Huvudcoachens summering</div>
              <div className="text-xs text-muted">Prioriteringar · Nästa steg</div>
            </div>
          </div>
          <div className="text-sm text-fg leading-relaxed">
            <Markdown text={insight.agents.summary} />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!insight && !loading && (
        <div className="bg-card border border-edge rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <div className="font-medium mb-1">Inga insikter ännu</div>
          <p className="text-muted text-sm">
            {!hasData
              ? 'Synka träningspass eller Garmin-hälsodata under Profil först — tränarteamet behöver data att analysera'
              : 'Klicka "Hämta insikter" så analyserar hela tränarteamet din data'}
          </p>
        </div>
      )}
    </div>
  )
}
