'use client'

import { useState } from 'react'

type Session = { day: string; type: string; description: string }
type Plan = {
  planType: 'mot_mal' | 'adaptiv'
  philosophy: string
  focusAreas: string[]
  sessions: Session[]
  generatedAt?: string
}

function parsePlan(raw: string | null): Plan | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.sessions)) return parsed
    return null
  } catch {
    return null
  }
}

export default function WeeklyPlanCard({
  savedPlan,
  activityCount,
}: {
  savedPlan: string | null
  activityCount: number
}) {
  const [plan, setPlan] = useState<Plan | null>(() => parsePlan(savedPlan))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function generate() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/plan/generate', { method: 'POST' })
      const data = await res.json()
      if (data.plan) {
        setPlan(data.plan)
      } else {
        setError(data.error ?? 'Något gick fel')
      }
    } catch {
      setError('Nätverksfel')
    }
    setLoading(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs text-muted uppercase tracking-wider">AI-veckoplan</h2>
        <button
          onClick={generate}
          disabled={loading || activityCount === 0}
          className="text-xs bg-bg border border-edge px-3 py-1.5 rounded-lg text-fg disabled:opacity-40 hover:border-accent transition-colors"
        >
          {loading ? 'Genererar...' : plan ? 'Uppdatera plan' : 'Generera plan'}
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
              {plan.sessions.map((s, i) => (
                <div key={i} className="bg-bg rounded-xl p-3 flex gap-3 items-start">
                  <div className="text-xs text-muted font-medium w-16 flex-shrink-0 pt-0.5">{s.day}</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-fg">{s.type}</div>
                    <div className="text-xs text-muted mt-0.5 leading-relaxed">{s.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-card border border-edge rounded-2xl p-6 text-center">
          <div className="text-muted text-sm">Ingen veckoplan genererad ännu</div>
          <p className="text-muted text-xs mt-1">
            {activityCount > 0
              ? 'Klicka på "Generera plan" för att få ett AI-upplägg baserat på din träningshistorik'
              : 'Synka träningspass först för att få en personlig plan'}
          </p>
        </div>
      )}
    </div>
  )
}
