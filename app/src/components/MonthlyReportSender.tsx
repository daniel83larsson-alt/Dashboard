'use client'

import { useState } from 'react'

// "Din månad" — större AI-skriven månadssammanfattning (träning, vikt,
// kost/viktmål, sömn/steg, vanor). Bara ett test-till-mig-själv-läge just
// nu, medvetet ingen "skicka till alla"-knapp — Daniel: "vill testa på mig
// själv först" innan det går till alla ~11 användare. Lägg till en
// send-to-all-väg (samma bekräftelsemönster som FeatureShowcaseSender) när
// det är validerat.
export default function MonthlyReportSender() {
  const [sending, setSending] = useState(false)
  const [sentLabel, setSentLabel] = useState('')
  const [error, setError] = useState('')

  async function sendTest() {
    setSending(true)
    setError('')
    setSentLabel('')
    try {
      const res = await fetch('/api/admin/monthly-report/send-test', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Kunde inte skicka'); setSending(false); return }
      setSentLabel(data.monthLabel ?? '')
    } catch {
      setError('Nätverksfel')
    }
    setSending(false)
  }

  return (
    <div className="bg-card border border-edge rounded-xl p-4 mb-6">
      <h2 className="text-sm font-medium text-muted mb-1">Din månad (pilot)</h2>
      <p className="text-muted text-xs mb-3">Genererar och skickar en AI-skriven månadssammanfattning för senaste kalendermånaden till din egen adress — inget skickas till andra användare än.</p>
      {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={sendTest}
          disabled={sending}
          className="text-xs border border-edge text-fg px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 hover:border-accent/30 transition-colors"
        >
          {sending ? 'Genererar och skickar…' : 'Skicka till mig själv'}
        </button>
        {sentLabel && <span className="text-xs text-accent">✓ Skickat ({sentLabel})</span>}
      </div>
    </div>
  )
}
