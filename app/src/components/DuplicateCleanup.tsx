'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type ActivityRow = {
  id: string
  strava_id: number
  start_date: string
  distance: number
  moving_time: number
  sport_type: string
  name: string
  average_heartrate: number | null
  description: string | null
}

type Group = { activities: ActivityRow[]; suggestedKeepId: string }

function fmtKm(m: number) { return (m / 1000).toFixed(1) + ' km' }
function fmtDur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

export default function DuplicateCleanup() {
  const router = useRouter()
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/activities/duplicates')
      .then(r => r.json())
      .then(data => {
        const gs: Group[] = data.groups ?? []
        setGroups(gs)
        const initial: Record<string, boolean> = {}
        gs.forEach(g => g.activities.forEach(a => { initial[a.id] = a.id !== g.suggestedKeepId }))
        setChecked(initial)
      })
      .catch(() => setGroups([]))
  }, [])

  if (!groups || groups.length === 0) return null

  const toRemove = Object.entries(checked).filter(([, v]) => v).map(([id]) => id)

  async function removeChecked() {
    if (!toRemove.length) return
    setBusy(true)
    try {
      const res = await fetch('/api/activities/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: toRemove }),
      })
      if (res.ok) {
        setGroups(prev => (prev ?? [])
          .map(g => ({ ...g, activities: g.activities.filter(a => !toRemove.includes(a.id)) }))
          .filter(g => g.activities.length > 1))
        router.refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-card border border-amber-500/30 rounded-2xl p-4 mb-4">
      <div className="text-xs uppercase tracking-wider text-amber-400 mb-1">Möjliga dubbletter hittade</div>
      <p className="text-muted text-sm mb-3">
        Samma pass verkar ha synkats från flera källor (t.ex. Concept2 och Garmin). Markera vilka som ska tas bort.
      </p>
      <div className="flex flex-col gap-3">
        {groups.map((g, gi) => (
          <div key={gi} className="border border-edge rounded-xl p-3">
            {g.activities.map(a => (
              <label key={a.id} className="flex items-center gap-3 py-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!checked[a.id]}
                  onChange={e => setChecked(prev => ({ ...prev, [a.id]: e.target.checked }))}
                  className="accent-accent"
                />
                <div className="flex-1 text-sm">
                  <span className="font-medium">{a.name}</span>{' '}
                  <span className="text-muted text-xs">
                    {new Date(a.start_date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} ·{' '}
                    {fmtKm(a.distance)} · {fmtDur(a.moving_time)} · {a.description ?? a.sport_type}
                  </span>
                </div>
                {a.id === g.suggestedKeepId && (
                  <span className="text-[10px] text-accent border border-accent/30 rounded px-1.5 py-0.5">behåll</span>
                )}
              </label>
            ))}
          </div>
        ))}
      </div>
      <button
        onClick={removeChecked}
        disabled={busy || toRemove.length === 0}
        className="mt-3 text-sm bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-lg px-3 py-2 disabled:opacity-50"
      >
        {busy ? 'Tar bort…' : `Ta bort markerade (${toRemove.length})`}
      </button>
    </div>
  )
}
