import { redirect } from 'next/navigation'

// Insikter merged into Hälsa & Insikter (behind a tab) — kept as a
// redirect, not deleted outright, so an old bookmark or link never just
// 404s.
export default function InsikterRedirect() {
  redirect('/dashboard/halsa?tab=insikter')
}
