'use client'

import { useEffect, useState } from 'react'

// Chrome/Edge/Android fire this event and let us trigger the real native
// install prompt ourselves. Safari/iOS never fires it — there's no
// programmatic way to trigger "Lägg till på hemskärmen" there, Apple only
// allows the user to do it manually via the share sheet, so iOS gets
// instructions instead of a real trigger.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  // Both derived from window/navigator, only knowable client-side — default
  // to "standalone" so the button never flashes on screen before we know.
  const [platform, setPlatform] = useState({ isIOS: false, isStandalone: true })
  const [showIOSHelp, setShowIOSHelp] = useState(false)

  useEffect(() => {
    // window/navigator don't exist during SSR, so this can't be a lazy
    // useState initializer — an effect is the only place this can run.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlatform({
      isIOS: /iphone|ipad|ipod/i.test(navigator.userAgent),
      isStandalone: window.matchMedia('(display-mode: standalone)').matches
        || (navigator as unknown as { standalone?: boolean }).standalone === true,
    })

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])

  const { isIOS, isStandalone } = platform

  if (isStandalone) return null
  if (!deferredPrompt && !isIOS) return null

  async function install() {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      await deferredPrompt.userChoice
      setDeferredPrompt(null)
    } else {
      setShowIOSHelp(true)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={install}
        className="flex items-center gap-1.5 text-xs bg-card border border-edge px-3 py-2 rounded-xl text-fg hover:border-accent/40 transition-colors"
      >
        <span>📲</span>
        <span className="hidden sm:inline">Lägg till på hemskärmen</span>
        <span className="sm:hidden">Installera</span>
      </button>

      {showIOSHelp && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowIOSHelp(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-card border border-edge rounded-xl p-4 shadow-xl text-sm">
            <p className="text-fg leading-relaxed">
              Tryck på dela-ikonen{' '}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-accent inline-block align-text-bottom">
                <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>{' '}
              i webbläsaren, välj sedan <strong>&quot;Lägg till på hemskärmen&quot;</strong>.
            </p>
            <button onClick={() => setShowIOSHelp(false)} className="text-accent text-xs mt-3 hover:underline">
              Stäng
            </button>
          </div>
        </>
      )}
    </div>
  )
}
