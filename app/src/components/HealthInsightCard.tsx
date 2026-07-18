'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type HealthInsight = { generatedAt: string; recovery: string; mental: string }

export default function HealthInsightCard({ savedInsight }: { savedInsight: HealthInsight | null }) {
  const [insight, setInsight] = useState<HealthInsight | null>(savedInsight)
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
      const res = await fetch('/api/insights/health', { method: 'POST' })
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

  return (
    <div className="bg-card border border-edge rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-fg">Hälsoteamets bedömning</div>
          <div className="text-muted text-[11px] mt-0.5">Baserat enbart på din hälsodata — sömn, vilopuls, HRV, steg</div>
          {insight && (
            <div className="text-muted text-xs mt-1">Uppdaterad {age === 0 ? 'precis' : `${age}h sedan`}</div>
          )}
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="bg-accent text-bg text-xs font-semibold px-3 py-2 rounded-xl disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center gap-2 flex-shrink-0"
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
        <p className="text-muted text-sm">Klicka för att låta återhämtnings- och mentalcoachen läsa av din hälsodata.</p>
      )}

      {insight && (
        <ul className="space-y-2">
          <li className="flex gap-2 text-xs leading-relaxed">
            <span className="flex-shrink-0">💤</span>
            <span className="text-fg/90"><strong className="text-fg">Återhämtning:</strong> {insight.recovery}</span>
          </li>
          <li className="flex gap-2 text-xs leading-relaxed">
            <span className="flex-shrink-0">🧠</span>
            <span className="text-fg/90"><strong className="text-fg">Mental:</strong> {insight.mental}</span>
          </li>
        </ul>
      )}
    </div>
  )
}
