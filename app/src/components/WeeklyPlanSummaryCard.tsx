'use client'

import { useEffect, useRef, useState } from 'react'

type SessionStatus = 'planned' | 'done' | 'skipped' | 'missed'

type Session = { is_rest: boolean; status: SessionStatus }

type Plan = { philosophy: string; sessions: Session[] }

// Thin Översikt-facing view of the weekly plan — the full day-by-day list
// with move/done/skip controls lives on its own page (/dashboard/veckoplan)
// now, this just keeps the front page's "is there a plan, roughly how's it
// going" glance and the auto-generate-on-first-visit-of-a-new-week trigger,
// so that behavior doesn't depend on which page happens to load first.
export default function WeeklyPlanSummaryCard({
  plan: initialPlan,
  hasActiveGoal,
  initialSports = [],
  compact = false,
}: {
  plan: Plan | null
  hasActiveGoal: boolean
  initialSports?: string[]
  // Ren visuell variant — samma auto-generera-planen-om-den-saknas-effekt
  // som alltid, bara en enda rad istället för hela kortet (Daniel: "Veckoplan
  // skulle man kunna ha en liten länk i själva kalender ... så blir det lite
  // renare"). Auto-genereringen får aldrig bero på vilken variant som
  // råkar renderas, så den logiken rörs inte alls.
  compact?: boolean
}) {
  const [plan, setPlan] = useState<Plan | null>(initialPlan)
  const [loading, setLoading] = useState(false)
  const autoTriedRef = useRef(false)

  useEffect(() => {
    if (autoTriedRef.current || plan || !hasActiveGoal) return
    autoTriedRef.current = true
    setLoading(true)
    // Carries over last week's sport selection, same as the picker on the
    // Veckoplan page defaults to — so an auto-generated week is identical
    // regardless of whether Översikt or Veckoplan happened to load first.
    fetch('/api/plan/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sports: initialSports }),
    })
      .then(res => res.json())
      .then(data => { if (data.plan) setPlan(data.plan) })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nonRest = plan?.sessions.filter(s => !s.is_rest) ?? []
  const doneCount = nonRest.filter(s => s.status === 'done').length

  if (compact) {
    // Ingen synlig kortyta alls utan ett godkänt mål — det finns inget att
    // länka till än, och Coach/Profil äger redan den nudge:en.
    if (!hasActiveGoal) return null
    return (
      <a href="/dashboard/veckoplan" className="text-xs text-accent hover:underline inline-block">
        {plan
          ? `Veckoplan: ${doneCount}/${nonRest.length} pass gjorda denna vecka →`
          : loading ? 'Genererar veckans plan...' : 'Öppna veckoplan →'}
      </a>
    )
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
      <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Veckoplan</h2>
      <a
        href="/dashboard/veckoplan"
        className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-2 hover:border-accent/40 transition-colors"
      >
        {plan ? (
          <>
            <p className="text-sm text-fg/90 leading-relaxed line-clamp-2">{plan.philosophy}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">{doneCount}/{nonRest.length} pass gjorda denna vecka</span>
              <span className="text-xs text-accent">Öppna veckoplan →</span>
            </div>
          </>
        ) : (
          <div className="text-center py-2">
            <div className="text-muted text-sm">{loading ? 'Genererar veckans plan...' : 'Ingen veckoplan genererad ännu'}</div>
            <span className="text-xs text-accent mt-1 inline-block">Öppna veckoplan →</span>
          </div>
        )}
      </a>
    </div>
  )
}
