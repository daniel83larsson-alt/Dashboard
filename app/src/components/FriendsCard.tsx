'use client'

import { useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type SearchResult = { id: string; name: string }
type PendingRequest = { id: string; follower_id: string; follower_name: string; created_at: string }
type MyFollow = { id: string; followee_id: string; followee_name: string; status: 'pending' | 'accepted'; created_at: string }

export default function FriendsCard({
  userId,
  initialPendingRequests,
  initialMyFollows,
}: {
  userId: string
  initialPendingRequests: PendingRequest[]
  initialMyFollows: MyFollow[]
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createSupabaseClient()

  const followedIds = new Set(initialMyFollows.map(f => f.followee_id))

  async function search(q: string) {
    setQuery(q)
    setError('')
    if (q.trim().length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    setSearching(true)
    const { data, error } = await supabase.rpc('search_profiles', { query: q.trim() })
    setSearching(false)
    setSearched(true)
    if (error) { setError('Kunde inte söka just nu.'); return }
    setResults(data ?? [])
  }

  async function sendRequest(id: string) {
    setBusyId(id)
    setError('')
    const { error } = await supabase.from('follows').insert({ follower_id: userId, followee_id: id, status: 'pending' })
    setBusyId(null)
    if (error) {
      setError(error.code === '23505' ? 'Du har redan skickat en förfrågan till den här personen.' : 'Kunde inte skicka förfrågan.')
      return
    }
    router.refresh()
  }

  async function respond(followId: string, accept: boolean) {
    setBusyId(followId)
    setError('')
    const { error } = accept
      ? await supabase.from('follows').update({ status: 'accepted' }).eq('id', followId)
      : await supabase.from('follows').delete().eq('id', followId)
    setBusyId(null)
    if (error) { setError('Kunde inte hantera förfrågan.'); return }
    router.refresh()
  }

  async function unfollow(followId: string) {
    setBusyId(followId)
    setError('')
    const { error } = await supabase.from('follows').delete().eq('id', followId)
    setBusyId(null)
    if (error) { setError('Kunde inte sluta följa.'); return }
    router.refresh()
  }

  return (
    <div className="bg-card border border-edge rounded-2xl p-5 space-y-5">
      <div>
        <h2 className="font-medium text-fg">Vänner</h2>
        <p className="text-muted text-xs mt-0.5">Följ en vän för att se deras träningspass på Översikt.</p>
      </div>

      {/* Väntande förfrågningar till mig */}
      {initialPendingRequests.length > 0 && (
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-2">Väntande förfrågningar</div>
          <div className="flex flex-col gap-2">
            {initialPendingRequests.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-bg rounded-xl px-3 py-2">
                <span className="text-sm">{r.follower_name}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => respond(r.id, true)}
                    disabled={busyId === r.id}
                    className="text-xs bg-accent text-bg px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed"
                  >
                    Godkänn
                  </button>
                  <button
                    onClick={() => respond(r.id, false)}
                    disabled={busyId === r.id}
                    className="text-xs bg-transparent border border-edge text-muted px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    Avslå
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sök vän */}
      <div>
        <div className="text-xs text-muted uppercase tracking-wider mb-2">Sök vän</div>
        <input
          type="text"
          value={query}
          onChange={e => search(e.target.value)}
          placeholder="Sök på namn…"
          className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
        />
        {error && <p className="text-red-400 text-xs mt-1.5">{error}</p>}
        {searching && <p className="text-muted text-xs mt-2">Söker…</p>}
        {!searching && searched && results.length === 0 && (
          <p className="text-muted text-xs mt-2">Ingen hittad med det namnet.</p>
        )}
        {results.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            {results.map(r => {
              const already = followedIds.has(r.id)
              return (
                <div key={r.id} className="flex items-center justify-between bg-bg rounded-xl px-3 py-2">
                  <span className="text-sm">{r.name}</span>
                  <button
                    onClick={() => sendRequest(r.id)}
                    disabled={already || busyId === r.id}
                    className="text-xs bg-accent text-bg px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 disabled:bg-edge disabled:text-muted"
                  >
                    {already ? 'Följer' : 'Följ'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Du följer */}
      {initialMyFollows.length > 0 && (
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-2">Du följer</div>
          <div className="flex flex-col gap-2">
            {initialMyFollows.map(f => (
              <div key={f.id} className="flex items-center justify-between bg-bg rounded-xl px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <span>{f.followee_name}</span>
                  {f.status === 'pending' && <span className="text-[10px] text-muted">väntar på godkännande</span>}
                </div>
                <button
                  onClick={() => unfollow(f.id)}
                  disabled={busyId === f.id}
                  className="text-xs bg-transparent border border-edge text-muted px-3 py-1.5 rounded-lg disabled:opacity-50"
                >
                  {f.status === 'pending' ? 'Avbryt' : 'Sluta följ'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
