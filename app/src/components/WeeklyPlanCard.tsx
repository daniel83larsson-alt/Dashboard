'use client'

import { useState } from 'react'

export default function WeeklyPlanCard({
  savedPlan,
  activityCount,
}: {
  savedPlan: string | null
  activityCount: number
}) {
  const [plan, setPlan] = useState(savedPlan)
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
        <div className="bg-card border border-edge rounded-2xl p-4">
          <pre className="text-sm text-fg whitespace-pre-wrap font-sans leading-relaxed">{plan}</pre>
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
