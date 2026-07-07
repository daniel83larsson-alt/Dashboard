import { sportIcon, sportLabel } from '@/lib/sport'

type FeedEntry = {
  activity_id: string
  owner_id: string
  owner_name: string
  sport_type: string
  activity_name: string
  distance: number
  moving_time: number
  start_date: string
}

function fmtKm(m: number) { return (m / 1000).toFixed(1) + ' km' }

function fmtDur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

function fmtRelative(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  const wasYesterday = d.toDateString() === yesterday.toDateString()
  const time = d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `Idag kl. ${time}`
  if (wasYesterday) return `Igår kl. ${time}`
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }) + ` kl. ${time}`
}

export default function FriendFeed({ feed }: { feed: FeedEntry[] }) {
  return (
    <div>
      <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Mina vänners träningspass</h2>
      {feed.length === 0 ? (
        <div className="bg-card border border-edge rounded-2xl p-6 text-center">
          <div className="text-muted text-sm">Inga vänner ännu</div>
          <p className="text-muted text-xs mt-1">
            <a href="/dashboard/profil" className="text-accent hover:underline">Sök upp och följ en vän under Profil</a>
          </p>
        </div>
      ) : (
        <div className="bg-card border border-edge rounded-2xl divide-y divide-edge">
          {feed.map(e => (
            <div key={e.activity_id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{e.owner_name}</span>
                  <span className="text-muted text-xs">{fmtRelative(e.start_date)}</span>
                </div>
                <div className="text-muted text-xs mt-0.5 truncate">
                  {sportIcon(e.sport_type)} {e.activity_name} · {sportLabel(e.sport_type)}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                {e.distance > 0 && <div className="font-mono text-accent text-sm font-bold leading-none">{fmtKm(e.distance)}</div>}
                <div className="text-muted text-xs mt-0.5">{fmtDur(e.moving_time)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
