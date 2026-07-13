'use client'

import { useState } from 'react'

export default function DemoResetButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ activities: number } | null>(null)
  const [error, setError] = useState('')

  async function reset() {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/admin/reset-demo', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Kunde inte återställa'); setLoading(false); return }
      setResult({ activities: data.activities })
    } catch {
      setError('Nätverksfel')
    }
    setLoading(false)
  }

  return (
    <div className="bg-card border border-edge rounded-xl p-4 mb-6">
      <h2 className="text-sm font-medium text-muted mb-3">Demo-konto</h2>
      <p className="text-xs text-muted mb-3">Skapar/återställer det delade demo-kontot (nås via &quot;Prova demo&quot; på login-sidan) med ny fejkdata.</p>
      <button
        onClick={reset}
        disabled={loading}
        className="bg-accent text-bg text-xs font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        {loading ? 'Återställer…' : 'Återställ demo-data'}
      </button>
      {result && <p className="text-lcd text-xs mt-2">Klart — {result.activities} fejkpass genererade.</p>}
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  )
}
