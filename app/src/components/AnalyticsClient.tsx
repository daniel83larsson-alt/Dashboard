'use client'

import { Analytics } from '@vercel/analytics/next'
import { track, type BeforeSendEvent } from '@vercel/analytics'

// Anonym besöksstatistik (Vercel Web Analytics: inga cookies, inga personuppgifter).
// Mäter bara de publika sidorna — allt inloggat (/dashboard, /auth, /api) skickas aldrig,
// eftersom de adresserna kan innehålla id:n för enskilda pass och användare.
function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const path = new URL(event.url).pathname
    if (path.startsWith('/dashboard') || path.startsWith('/auth') || path.startsWith('/api')) return null
  } catch {
    return null
  }
  return event
}

export default function AnalyticsClient() {
  return <Analytics beforeSend={beforeSend} />
}

// Små, anonyma händelser för välkomstflödet. Tomma funktioner om analys inte är
// påslagen i Vercel (eller på en plan som saknar anpassade händelser) — påverkar inget.
export function trackEvent(name: 'signup_click' | 'demo_click' | 'signup_submitted', where?: string) {
  try { track(name, where ? { where } : undefined) } catch {}
}
