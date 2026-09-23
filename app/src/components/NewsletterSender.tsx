'use client'

import { useState } from 'react'

// Förifyllt utkast med de senaste användarvända nyheterna — admin kan
// redigera fritt innan utskick, det här är bara en startpunkt så man slipper
// skriva ihop en sammanfattning från noll varje gång. Uppdaterat 2026-09-23
// (föregående utskick var 2026-07-19) med allt som hänt sedan dess.
const DRAFT_SUBJECT = 'Nytt i DL Trainer — kaloribudget, YAZIO, vanor och Claude-koppling'
const DRAFT_NEWS = [
  'YAZIO kan nu kopplas ihop med DL Trainer — din matdagbok synkas automatiskt varje natt, med måltidsuppdelning, vatten, fasta och viktresa direkt på Mat-sidan. Ingen manuell inmatning behövs längre om du redan använder YAZIO.',
  'Viktmål har fått en rejäl uppgradering: sätt en målvikt och ett datum, så räknar vi ut en daglig kaloribudget och ett proteinmål som uppdateras automatiskt varje vecka utifrån hur det faktiskt går — med inbyggda säkerhetsgränser så budgeten aldrig blir orimlig.',
  'Nytt på Viktmål: en liten sammanfattning direkt under procentbaren — hur mycket du gått ner, hur många dagar och cm sedan starten.',
  'Vanor — kryssa av dagliga eller egna-intervall-vanor (kreatin, stretching, vad du vill), bygg en streak, och få en riktig eloge när du når 5 veckor, ett halvår eller ett helt år i rad.',
  '"Vänner denna vecka" på Översikt — se hur länge och långt dina vänner tränat den här veckan, med dina egna siffror med som referens.',
  'Ny AI-assisterad matbild-analys blev pålitligare — färre "nätverksfel" när du fotar mat, bilder komprimeras nu innan de skickas.',
  'Nytt: koppla din egen Claude direkt till din träningsdata via en personlig nyckel på Profil-sidan. Fråga om ditt kaloriunderskott, din TDEE-trend, ett specifikt datums matlogg eller din träningshistorik — svaret kommer från dina egna, riktiga siffror.',
  'Logga pass i efterhand med automatiskt uträknade kalorier, push-notiser för streaks och nya synkade pass, och en rad mindre buggfixar (bl.a. stegsnitt och pulszoner för ihopslagna Garmin+Concept2-pass).',
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
