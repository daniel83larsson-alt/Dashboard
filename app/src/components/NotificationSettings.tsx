'use client'

import { useEffect, useState } from 'react'
import { ensureSubscribedAndSynced, pushSupported } from '@/lib/push-client'

type Status = 'unsupported' | 'default' | 'denied' | 'subscribing' | 'subscribed' | 'error'
type TestResult = { devices: number; sent: number; failed: number; errors: { status: number | null; body: string }[] }

export default function NotificationSettings() {
  const [status, setStatus] = useState<Status>('default')

  useEffect(() => {
    async function check() {
      if (!pushSupported()) {
        setStatus('unsupported')
        return
      }
      if (Notification.permission === 'denied') {
        setStatus('denied')
        return
      }
      // Tillstånd redan givet men prenumerationen försvunnit (iOS gör så) →
      // skapa om den tyst och synka med servern i stället för att visa "av".
      if (Notification.permission === 'granted') {
        try {
          const r = await ensureSubscribedAndSynced()
          setStatus(r.ok ? 'subscribed' : 'error')
          return
        } catch {
          setStatus('error')
          return
        }
      }
      setStatus('default')
    }
    check()
  }, [])

  async function enable() {
    setStatus('subscribing')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'default')
        return
      }
      const r = await ensureSubscribedAndSynced()
      setStatus(r.ok ? 'subscribed' : 'error')
    } catch {
      setStatus('error')
    }
  }

  const [test, setTest] = useState<{ state: 'idle' | 'sending' | 'done' | 'error'; result?: TestResult }>({ state: 'idle' })

  async function sendTest() {
    setTest({ state: 'sending' })
    try {
      let res = await fetch('/api/push/test', { method: 'POST' })
      let data = await res.json() as TestResult
      // Inga enheter hos servern men tillstånd finns → synka om och försök en gång till.
      if (res.ok && data.devices === 0) {
        const r = await ensureSubscribedAndSynced()
        if (r.ok) {
          res = await fetch('/api/push/test', { method: 'POST' })
          data = await res.json() as TestResult
        }
      }
      setTest(res.ok ? { state: 'done', result: data } : { state: 'error' })
    } catch {
      setTest({ state: 'error' })
    }
  }

  return (
    <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
      <div>
        <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Notiser</div>
        <p className="text-muted text-xs">Få en push-notis när en vän gillar ditt pass, du slår ett rekord, din streak är i fara, eller dagssynken hittar nya pass.</p>
      </div>

      {status === 'unsupported' && (
        <p className="text-muted text-xs">Din webbläsare stödjer inte notiser.</p>
      )}
      {status === 'denied' && (
        <p className="text-muted text-xs">Notiser är blockerade för DL Trainer i din webbläsare — ändra det i webbläsarens inställningar för att slå på.</p>
      )}
      {status === 'subscribed' && (
        <div className="flex flex-col gap-2">
          <div className="text-accent text-sm">✓ Notiser aktiverade på den här enheten</div>
          <button
            onClick={sendTest}
            disabled={test.state === 'sending'}
            className="text-xs border border-edge rounded-xl px-3 py-2 text-fg hover:border-accent/40 transition-colors disabled:opacity-50 self-start"
          >
            {test.state === 'sending' ? 'Skickar…' : 'Skicka testnotis'}
          </button>
          <div role="status" className="text-xs text-muted">
            {test.state === 'done' && test.result && (
              test.result.devices === 0
                ? 'Servern känner inte till någon enhet än — öppna sidan igen och försök på nytt.'
                : test.result.sent > 0
                  ? `Skickad till ${test.result.sent} av ${test.result.devices} enhet${test.result.devices > 1 ? 'er' : ''}. Kommer den inte fram inom en minut, kolla att notiser är tillåtna för DL Trainer i telefonens inställningar.`
                  : `Push-tjänsten avvisade den (${test.result.errors.map(e => e.status ?? 'okänt fel').join(', ')}). Slå av och på notiser här och prova igen.`
            )}
            {test.state === 'error' && 'Kunde inte skicka testet. Försök igen.'}
          </div>
        </div>
      )}
      {(status === 'default' || status === 'subscribing' || status === 'error') && (
        <>
          <button
            onClick={enable}
            disabled={status === 'subscribing'}
            className="bg-accent text-bg text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed hover:opacity-90 transition-opacity w-full"
          >
            {status === 'subscribing' ? 'Aktiverar…' : 'Aktivera notiser'}
          </button>
          {status === 'error' && <p className="text-red-400 text-xs">Något gick fel — försök igen.</p>}
        </>
      )}
    </div>
  )
}
