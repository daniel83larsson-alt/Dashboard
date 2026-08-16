'use client'

import { useState } from 'react'
import type { ReachedMilestone } from '@/lib/milestones'

// Daniel: "sidan blinkar till och firar det målat... annan färg på sidan
// den dagen." Landade på en tydlig banderoll + guld-glow istället för att
// byta hela sidans färgtema för dagen — samma slutsats som restaurang-
// receptsajtens burk-badge-avvägning tidigare: hellre en avgränsad,
// tydlig highlight än att sidan i övrigt känns rörig eller otypisk för sig
// själv. `celebrated_milestones`-tabellens unik-constraint gör att den här
// listan bara någonsin innehåller NYA milstolpar — samma sida laddad igen
// senare visar ingenting, ingen egen "har jag redan sett den här"-logik
// behövs här.
export default function MilestoneBanner({ milestones }: { milestones: ReachedMilestone[] }) {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const visible = milestones.map((m, i) => ({ m, i })).filter(({ i }) => !dismissed.has(i))
  if (!visible.length) return null

  return (
    <div className="flex flex-col gap-2">
      {visible.map(({ m, i }) => (
        <div
          key={`${m.kind}-${m.streakKey}-${m.value}`}
          className="relative overflow-hidden rounded-2xl p-4 flex items-center justify-between gap-3 border border-accent/40"
          style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, var(--card)), color-mix(in srgb, var(--habit) 14%, var(--card)))' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl flex-shrink-0" aria-hidden>🎉</span>
            <p className="text-sm text-fg font-medium leading-snug">{m.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(prev => new Set(prev).add(i))}
            aria-label="Stäng"
            className="text-muted hover:text-fg flex-shrink-0 text-lg leading-none px-1"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
