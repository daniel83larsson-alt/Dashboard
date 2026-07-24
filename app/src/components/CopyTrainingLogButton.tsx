'use client'

import { useState } from 'react'

export default function CopyTrainingLogButton() {
  const [weeks, setWeeks] = useState('47')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  async function copy() {
    const n = Math.max(1, parseInt(weeks, 10) || 12)
    setLoading(true)
    setError('')
    setCopied(false)
    try {
      const res = await fetch(`/api/activities/summary-text?weeks=${n}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Något gick fel')
        return
      }
      await navigator.clipboard.writeText(data.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setError('Kunde inte kopiera — testa igen')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
      <div>
        <div className="text-xs text-muted uppercase tracking-wider">Kopiera till träningschatt</div>
        <p className="text-muted text-xs mt-0.5">Text-sammanfattning av dina pass, redo att klistra in i en annan AI-chatt</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={104}
          inputMode="numeric"
          value={weeks}
          onChange={e => setWeeks(e.target.value)}
          className="w-20 bg-bg border border-edge rounded-xl px-3 py-2 text-sm text-fg text-center focus:outline-none focus:border-accent"
        />
        <span className="text-muted text-xs">veckor tillbaka</span>
        <button
          onClick={copy}
          disabled={loading}
          className="ml-auto bg-accent text-bg text-xs font-semibold px-3 py-2 rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {loading ? 'Hämtar...' : copied ? '✓ Kopierat' : 'Kopiera'}
        </button>
      </div>
      {error && <div className="text-red-400 text-xs">{error}</div>}
    </div>
  )
}
