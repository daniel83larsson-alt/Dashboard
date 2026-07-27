'use client'

import { useState } from 'react'

// Fristående kampanjmejl ("Vad är nytt") med riktiga skärmdumpar av appens
// funktioner — egen mall (feature-showcase-email.ts), inte samma som det
// fria-text-nyhetsbrevet ovan. Samma säkerhetsmönster: test-till-mig-själv
// först, sedan en bekräftelsespärr innan det går till alla.
export default function FeatureShowcaseSender({ recipientCount }: { recipientCount: number }) {
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [testSent, setTestSent] = useState(false)
  const [result, setResult] = useState<{ sentCount: number; failedCount: number } | null>(null)
  const [error, setError] = useState('')

  async function send(testOnly: boolean) {
    if (testOnly) setTestSending(true)
    else setSending(true)
    setError('')
    try {
      const res = await fetch('/api/admin/newsletter/send-showcase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testOnly }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Kunde inte skicka'); setSending(false); setTestSending(false); setConfirming(false); return }
      if (testOnly) setTestSent(true)
      else setResult(data)
    } catch {
      setError('Nätverksfel')
    }
    setSending(false)
    setTestSending(false)
    setConfirming(false)
  }

  return (
    <div className="bg-card border border-edge rounded-xl p-4 mb-6">
      <h2 className="text-sm font-medium text-muted mb-1">Funktionsmejl — &quot;Vad är nytt&quot;</h2>
      <p className="text-muted text-xs mb-3">Ett fast, designat mejl med riktiga skärmdumpar av de starkaste funktionerna, till {recipientCount} användare.</p>

      {result ? (
        <div className="text-xs">
          <div className="text-fg mb-1">Skickat till {result.sentCount} av {result.sentCount + result.failedCount} mottagare.</div>
          {result.failedCount > 0 && <div className="text-amber-400">{result.failedCount} misslyckades.</div>}
        </div>
      ) : (
        <>
          {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => send(true)}
              disabled={testSending || sending}
              className="text-xs border border-edge text-fg px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 hover:border-accent/30 transition-colors"
            >
              {testSending ? 'Skickar test…' : 'Skicka test till mig själv'}
            </button>
            {testSent && <span className="text-xs text-accent">✓ Testmejl skickat till din adress</span>}
          </div>

          {confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-400">Skicka till {recipientCount} riktiga användare?</span>
              <button
                onClick={() => send(false)}
                disabled={sending}
                className="text-xs bg-accent text-bg px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed"
              >
                {sending ? 'Skickar…' : 'Ja, skicka'}
              </button>
              <button onClick={() => setConfirming(false)} disabled={sending} className="text-xs text-muted px-3 py-1.5">
                Avbryt
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="text-xs bg-accent text-bg px-3 py-1.5 rounded-lg font-medium"
            >
              Skicka till alla
            </button>
          )}
        </>
      )}
    </div>
  )
}
