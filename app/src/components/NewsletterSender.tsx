'use client'

import { useState } from 'react'

// Förifyllt utkast med de senaste användarvända nyheterna — admin kan
// redigera fritt innan utskick, det här är bara en startpunkt så man slipper
// skriva ihop en sammanfattning från noll varje gång.
const DRAFT_SUBJECT = 'Nytt i DL Trainer — VO2max, belastning, rörlighet och mer'
const DRAFT_NEWS = [
  'Nu kan du se ditt VO2max på Hälsa-sidan — antingen hämtat direkt från Garmin eller ett eget beräknat estimat, alltid tydligt märkt med källa och datum.',
  'Ny "Belastning"-ruta på Översikt visar hur din veckoträning ligger till mot ditt veckomål (eller ett rullande snitt om du inte satt något mål än).',
  'Rörlighet — en ny sida där du sätter ihop ett stretch-/mobilitetspass för valfri kroppsdel, loggas som ett vanligt pass.',
  'Rutter — sök löp-, cykel- och vandringsleder nära dig eller en valfri plats, med karta.',
  'Roddpass från Concept2 visar nu riktiga delsträckor (split-tider) på passdetaljsidan.',
  'Kettlebell är nu en egen träningstyp i "Logga pass", med snabbval för de vanligaste övningarna.',
  'Insikter är omarbetat — nu med egna specialister för sömn, steg, mental träning, styrka och rörlighet, inte bara en generell sammanfattning.',
  'Rekord har flyttat till en egen sida i menyn, med snabbaste 1/3/5/10 km för alla dina sporter.',
].join('\n')

export default function NewsletterSender({ recipientCount }: { recipientCount: number }) {
  const [subject, setSubject] = useState(DRAFT_SUBJECT)
  const [appNews, setAppNews] = useState(DRAFT_NEWS)
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
      const res = await fetch('/api/admin/newsletter/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, appNews, testOnly }),
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
          <p className="text-muted text-xs mb-3">Går till {recipientCount} användare (opt-outs redan exkluderade). Förifyllt utkast nedan — redigera fritt.</p>
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
            rows={8}
            className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors mb-2 resize-none"
          />
          {error && <p className="text-red-400 text-xs mb-2">{error}</p>}

          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => send(true)}
              disabled={testSending || sending || !subject.trim() || !appNews.trim()}
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
              disabled={!subject.trim() || !appNews.trim()}
              className="text-xs bg-accent text-bg px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 disabled:bg-edge disabled:text-muted"
            >
              Skicka till alla
            </button>
          )}
        </>
      )}
    </div>
  )
}
