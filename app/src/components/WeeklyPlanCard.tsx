'use client'

import { useEffect, useRef, useState } from 'react'

type SessionStatus = 'planned' | 'done' | 'skipped' | 'missed'

type Session = {
  id: string
  planned_date: string
  is_rest: boolean
  sport_type: string | null
  title: string
  description: string
  status: SessionStatus
  matched_activity_id: string | null
}

type Plan = {
  id: string
  weekStart: string
  planType: 'mot_mal' | 'adaptiv'
  philosophy: string
  focusAreas: string[]
  sessions: Session[]
}

function weekdayLabel(dateStr: string) {
  const label = new Date(`${dateStr}T00:00:00`).toLocaleDateString('sv-SE', { weekday: 'long' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export default function WeeklyPlanCard({
  plan: initialPlan,
  hasActiveGoal,
}: {
  plan: Plan | null
  hasActiveGoal: boolean
}) {
  const [plan, setPlan] = useState<Plan | null>(initialPlan)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const autoTriedRef = useRef(false)

  async function generate() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/plan/generate', { method: 'POST' })
      const data = await res.json()
      if (data.plan) {
        setPlan(data.plan)
      } else {
        setError(data.message ?? data.error ?? 'Något gick fel')
      }
    } catch {
      setError('Nätverksfel')
    }
    setLoading(false)
  }

  // First visit of a new week (no plan yet, but a goal is in place) plans
  // itself automatically instead of waiting for a manual click — the
  // product decision was that this should feel organic, not like a chore.
  // Manual "Uppdatera plan" stays available below regardless.
  useEffect(() => {
    if (!autoTriedRef.current && !plan && hasActiveGoal) {
      autoTriedRef.current = true
      generate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function updateSession(sessionId: string, status: SessionStatus) {
    if (!plan) return
    // Optimistic update — this is a low-stakes personal checklist, not
    // something that needs a round-trip before feeling responsive.
    const prevSessions = plan.sessions
    setPlan({ ...plan, sessions: plan.sessions.map(s => s.id === sessionId ? { ...s, status } : s) })
    try {
      const res = await fetch('/api/plan/session/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, status }),
      })
      if (!res.ok) setPlan({ ...plan, sessions: prevSessions })
    } catch {
      setPlan({ ...plan, sessions: prevSessions })
    }
  }

  if (!hasActiveGoal) {
    return (
      <div>
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Veckoplan</h2>
        <div className="bg-card border border-edge rounded-2xl p-6 text-center">
          <div className="text-muted text-sm">Inget mål godkänt ännu</div>
          <p className="text-muted text-xs mt-1">Prata med coachen för att sätta ett mål — när det är godkänt kan veckan planeras.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs text-muted uppercase tracking-wider">AI-veckoplan</h2>
        <button
          onClick={generate}
          disabled={loading}
          className="text-xs bg-bg border border-edge px-3 py-1.5 rounded-lg text-fg disabled:opacity-40 hover:border-accent transition-colors"
        >
          {loading ? 'Genererar...' : plan ? 'Uppdatera plan' : 'Planera veckan'}
        </button>
      </div>

      {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

      {plan ? (
        <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-4">
          {/* Philosophy / framing */}
          <div>
            <div className="text-xs text-accent font-medium mb-1 uppercase tracking-wide">
              {plan.planType === 'mot_mal' ? '🎯 Mot målet' : '🔄 Adaptivt upplägg'}
            </div>
            <p className="text-sm text-fg/90 leading-relaxed">{plan.philosophy}</p>
          </div>

          {/* Focus areas */}
          {plan.focusAreas?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {plan.focusAreas.map((f, i) => (
                <span key={i} className="text-xs bg-bg border border-edge text-muted px-2 py-1 rounded-lg">
                  {f}
                </span>
              ))}
            </div>
          )}

          {/* Sessions */}
          {plan.sessions?.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {plan.sessions.map(s => (
                <div key={s.id} className={`bg-bg rounded-xl p-3 flex gap-3 items-start ${s.status === 'skipped' ? 'opacity-50' : ''}`}>
                  <div className="text-xs text-muted font-medium w-16 flex-shrink-0 pt-0.5">{weekdayLabel(s.planned_date)}</div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${s.status === 'done' ? 'text-lcd' : 'text-fg'}`}>
                      {s.status === 'done' && '✓ '}{s.title}
                    </div>
                    <div className="text-xs text-muted mt-0.5 leading-relaxed">{s.description}</div>
                  </div>
                  {!s.is_rest && (
                    <div className="flex-shrink-0 flex gap-1">
                      {s.status === 'planned' && (
                        <>
                          <button
                            onClick={() => updateSession(s.id, 'done')}
                            className="text-xs bg-card border border-edge px-2 py-1 rounded-lg text-fg hover:border-accent transition-colors"
                          >
                            Bocka av
                          </button>
                          <button
                            onClick={() => updateSession(s.id, 'skipped')}
                            className="text-xs bg-card border border-edge px-2 py-1 rounded-lg text-muted hover:border-accent transition-colors"
                          >
                            Hoppa över
                          </button>
                        </>
                      )}
                      {(s.status === 'done' || s.status === 'skipped') && (
                        <button
                          onClick={() => updateSession(s.id, 'planned')}
                          className="text-xs bg-card border border-edge px-2 py-1 rounded-lg text-muted hover:border-accent transition-colors"
                        >
                          Ångra
                        </button>
                      )}
                      {s.status === 'missed' && (
                        <span className="text-xs text-muted">Missat</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-card border border-edge rounded-2xl p-6 text-center">
          <div className="text-muted text-sm">{loading ? 'Genererar veckans plan...' : 'Ingen veckoplan genererad ännu'}</div>
          {!loading && (
            <p className="text-muted text-xs mt-1">Klicka på &quot;Planera veckan&quot; för att få den här veckans pass baserat på ditt mål</p>
          )}
        </div>
      )}
    </div>
  )
}
