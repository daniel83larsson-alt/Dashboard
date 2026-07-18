'use client'

import { useEffect, useState } from 'react'

// Standard VAPID applicationServerKey conversion (browsers want a raw
// Uint8Array, the key is handed out as URL-safe base64).
function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64Safe)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0))).buffer as ArrayBuffer
}

type Status = 'unsupported' | 'default' | 'denied' | 'subscribing' | 'subscribed' | 'error'

export default function NotificationSettings() {
  const [status, setStatus] = useState<Status>('default')

  useEffect(() => {
    async function check() {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        setStatus('unsupported')
        return
      }
      if (Notification.permission === 'denied') {
        setStatus('denied')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      setStatus(existing ? 'subscribed' : 'default')
    }
    check()
  }, [])

  async function enable() {
    setStatus('subscribing')
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!publicKey) throw new Error('missing key')

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'default')
        return
      }

      const reg = await navigator.serviceWorker.ready
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      })
      setStatus(res.ok ? 'subscribed' : 'error')
    } catch {
      setStatus('error')
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
        <div className="text-accent text-sm">✓ Notiser aktiverade på den här enheten</div>
      )}
      {(status === 'default' || status === 'subscribing' || status === 'error') && (
        <>
          <button
            onClick={enable}
            disabled={status === 'subscribing'}
            className="bg-accent text-bg text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed hover:opacity-90 transition-opacity w-full"
          >
            {status === 'subscribing' ? 'Aktiverar...' : 'Aktivera notiser'}
          </button>
          {status === 'error' && <p className="text-red-400 text-xs">Något gick fel — försök igen.</p>}
        </>
      )}
    </div>
  )
}
