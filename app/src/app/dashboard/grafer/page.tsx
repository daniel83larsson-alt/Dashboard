import { redirect } from 'next/navigation'

// Grafer merged into Hälsa & Insikter (behind a tab) — kept as a redirect,
// not deleted outright, so an old bookmark or link never just 404s.
export default function GraferRedirect() {
  redirect('/dashboard/halsa?tab=grafer')
}
