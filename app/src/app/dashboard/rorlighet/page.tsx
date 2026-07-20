import { redirect } from 'next/navigation'

// Rörlighet merged into Logga pass (behind a tab) — kept as a redirect, not
// deleted outright, so an old bookmark or link never just 404s.
export default function RorlighetRedirect() {
  redirect('/dashboard/logga?tab=rorlighet')
}
