'use client'

import { useState } from 'react'

export default function NewsletterSender({ recipientCount }: { recipientCount: number }) {
  const [subject, setSubject] = useState('')
  const [appNews, setAppNews] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sentCount: number; failedCount: number } | null>(null)
  const [error, setError] = useState('')

  async function send() {
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/admin/newsletter/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, appNews }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Kunde inte skicka'); setSending(false); setConfirming(false); return }
      setResult(data)
    } catch {
      setError('Nätverksfel')
    }
    setSending(false)
    setConfirming(false)
  }

  return (
    <div className="bg-card border border-edge rounded-xl p-4 mb-6">
      <h2 className="text-sm font-medium text-muted mb-3">Nyhetsbrev</h2>

      {result ? (
        <div className="text-xs">
          <div className="text-fg mb-1">Skickat till {result.sentCount} av {result.sentCount + result.failedCount} mottagare.</div>
          {result.failedCount > 0 && <div className="text-amber-400">{result.failedCount} misslyckades.</div>}
          <button onClick={() => { setResult(null); setSubject(''); setAppNews('') }} className="mt-2 text-accent hover:underline">
            Skriv ett nytt
          </button>
        </div>
      ) : (
        <>
          <p className="text-muted text-xs mb-3">Går till {recipientCount} användare (opt-outs redan exkluderade).</p>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Ämnesrad"
            className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors mb-2"
          />
          <textarea
            value={appNews}
            onChange={e => setAppNews(e.target.value)}
            placeholder="Nyheter i appen — en rad per nyhet"
            rows={4}
            className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors mb-2 resize-none"
          />
          {error && <p className="text-red-400 text-xs mb-2">{error}</p>}

          {confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-400">Skicka till {recipientCount} riktiga användare?</span>
              <button
                onClick={send}
                disabled={sending}
                className="text-xs bg-accent text-bg px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
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
              disabled={!subject.trim() || !appNews.trim()}
              className="text-xs bg-accent text-bg px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 disabled:bg-edge disabled:text-muted"
            >
              Skicka
            </button>
          )}
        </>
      )}
    </div>
  )
}
