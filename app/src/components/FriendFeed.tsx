'use client'

import { fmtActivityWhen } from '@/lib/wall-clock'
import { useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import { sportIcon, sportLabel } from '@/lib/sport'
import FriendActivityMap from '@/components/FriendActivityMap'

type FeedEntry = {
  activity_id: string
  owner_id: string
  owner_name: string
  sport_type: string
  activity_name: string
  distance: number
  moving_time: number
  start_date: string
  source?: string | null // styr hur starttiden läses, se lib/wall-clock.ts
  kudos_count: number
  liked_by_me: boolean
  // What this pass was a personal record in (e.g. "Snabbaste 5 km") — see
  // lib/friend-records.ts. Empty/absent = not a record.
  records?: string[]
}

function fmtKm(m: number) { return (m / 1000).toFixed(1) + ' km' }

function fmtDur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

export default function FriendFeed({ feed, userId }: { feed: FeedEntry[]; userId: string }) {
  const [entries, setEntries] = useState(feed)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const supabase = createSupabaseClient()

  async function toggleLike(activityId: string, liked: boolean) {
    setBusyId(activityId)
    // Optimistic update — flip immediately, roll back if the request fails.
    setEntries(prev => prev.map(e => e.activity_id === activityId
      ? { ...e, liked_by_me: !liked, kudos_count: e.kudos_count + (liked ? -1 : 1) }
      : e))

    const { error } = liked
      ? await supabase.from('activity_kudos').delete().eq('activity_id', activityId).eq('giver_id', userId)
      : await supabase.from('activity_kudos').insert({ activity_id: activityId, giver_id: userId })

    if (error) {
      setEntries(prev => prev.map(e => e.activity_id === activityId
        ? { ...e, liked_by_me: liked, kudos_count: e.kudos_count + (liked ? 1 : -1) }
        : e))
    }
    setBusyId(null)
  }

  return (
    <div>
      <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Mina vänners träningspass</h2>
      {entries.length === 0 ? (
        <div className="bg-card border border-edge rounded-2xl p-6 text-center">
          <div className="text-muted text-sm">Inga vänner ännu</div>
          <p className="text-muted text-xs mt-1">
            <a href="/dashboard/profil" className="text-accent hover:underline">Sök upp och bli vän med någon under Profil</a>
          </p>
        </div>
      ) : (
        <div className="bg-card border border-edge rounded-2xl divide-y divide-edge">
          {entries.map(e => {
            const isExpanded = expandedId === e.activity_id
            return (
              <div key={e.activity_id}>
                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : e.activity_id)}
                    className="min-w-0 text-left flex-1"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{e.owner_name}</span>
                      <span className="text-muted text-xs">{fmtActivityWhen(e.start_date, e.source)}</span>
                    </div>
                    <div className="text-muted text-xs mt-0.5 truncate">
                      {sportIcon(e.sport_type)} {e.activity_name} · {sportLabel(e.sport_type)}
                    </div>
                    {e.records && e.records.length > 0 && (
                      // Same amber 🏅 look as the "Nytt rekord" medal on the
                      // user's own latest pass (Översikt) — one visual
                      // language for "a record was broken here".
                      <div
                        // Wraps instead of truncating: a pass can break several
                        // records at once, and on a phone there's no hover to
                        // reveal a clipped label — everything must be readable.
                        className="mt-1.5 flex w-fit max-w-full min-w-0 items-start gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium leading-snug text-amber-400"
                        title={`Personligt rekord: ${e.records.join(', ')}`}
                      >
                        <span aria-hidden="true">🏅</span>
                        <span>
                          Rekord ·
                          {/* nowrap per label, with the SPACE between labels outside the nowrap span so it stays a
                              legal line-break point: a line may break BETWEEN records, never inside "Snabbaste 5 km" */}
                          {e.records.map((r, i) => (
                            <span key={r}>
                              {' '}
                              <span className="whitespace-nowrap">{r}{i < e.records!.length - 1 ? ' ·' : ''}</span>
                            </span>
                          ))}
                        </span>
                      </div>
                    )}
                  </button>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      {e.distance > 0 && <div className="font-mono text-accent text-sm font-bold leading-none">{fmtKm(e.distance)}</div>}
                      <div className="text-muted text-xs mt-0.5">{fmtDur(e.moving_time)}</div>
                    </div>
                    <button
                      onClick={() => toggleLike(e.activity_id, e.liked_by_me)}
                      disabled={busyId === e.activity_id}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-50 ${
                        e.liked_by_me ? 'bg-accent/15 text-accent' : 'bg-bg text-muted hover:text-fg'
                      }`}
                      title={e.liked_by_me ? 'Ta bort tummen upp' : 'Ge tummen upp'}
                    >
                      <span>👍</span>
                      {e.kudos_count > 0 && <span>{e.kudos_count}</span>}
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-4 pb-4">
                    <FriendActivityMap activityId={e.activity_id} label={e.activity_name} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
