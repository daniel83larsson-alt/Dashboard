import Link from 'next/link'
import { getServerSession } from '@/lib/supabase-server'
import { startOfWeek, stockholmDateKey } from '@/lib/dates'
import { dedupeForStats } from '@/lib/duplicates'
import { dedupeFriendFeed, type FriendFeedRow } from '@/lib/friend-feed'
import { summarizeFriendWeek } from '@/lib/friend-week'
import { periodsFromMonthly, type MonthlyRow } from '@/lib/friend-period'
import FriendFeed from '@/components/FriendFeed'
import FriendPeriodCard from '@/components/FriendPeriodCard'

// Egen sida för vännerna (Daniel: flytta vännerlistan och summeringen från Översikt hit — mer
// detalj, mer tävlingskänsla, och Översikt blir lättare). Allt vän-relaterat läses här, inte på
// startsidan.
export default async function VannerPage() {
  const { supabase, user } = await getServerSession()
  if (!user) return null

  const weekStart = startOfWeek(new Date())
  const nextWeekStart = new Date(weekStart)
  nextWeekStart.setDate(nextWeekStart.getDate() + 7)

  const [{ data: friendFeed }, { data: friendRoster }, { data: friendWeekActivities }, { data: monthlyRows, error: monthlyError }, { data: ownRows }] = await Promise.all([
    supabase.rpc('friend_activity_feed'),
    supabase.rpc('friend_roster'),
    supabase.rpc('friend_weekly_activities', { week_start: weekStart.toISOString(), week_end: nextWeekStart.toISOString() }),
    // Förberäknade månadssummor (egna + vänners via RLS) — inte hela historiken. Se lib/records-store.ts.
    supabase.from('activity_monthly').select('user_id, month, moving_time_sec, distance_m, sessions'),
    // Egna pass, bara veckans (med ett dygns marginal för klocktid-som-UTC) och bara de kolumner som veckosummeringen behöver.
    supabase.from('activities').select('id, strava_id, start_date, distance, moving_time, sport_type, source, calories').eq('user_id', user.id).gte('start_date', new Date(weekStart.getTime() - 24 * 3600 * 1000).toISOString()),
  ])

  const roster = (friendRoster ?? []) as { owner_id: string; owner_name: string }[]

  // Egna pass: samma sammanslagning av Garmin+Concept2-dubbletter som på övriga sidor.
  const own = dedupeForStats((ownRows ?? []).map(a => ({ ...a, source: a.source ?? undefined })))
  const ownWeek = own.filter(a => a.start_date >= weekStart.toISOString() && a.start_date < nextWeekStart.toISOString())

  type WeekRpcRow = {
    activity_id: string; owner_id: string; owner_name: string; sport_type: string
    distance: number; moving_time: number; start_date: string; source: string | null; strava_id: number
  }
  const friendWeekRows = ((friendWeekActivities ?? []) as WeekRpcRow[]).map(a => ({
    id: a.activity_id, strava_id: a.strava_id, start_date: a.start_date, distance: a.distance,
    moving_time: a.moving_time, sport_type: a.sport_type, source: a.source ?? undefined,
    owner_id: a.owner_id, owner_name: a.owner_name,
  }))
  const friendWeek = summarizeFriendWeek(friendWeekRows, roster)
  const weekRows = [
    {
      ownerId: user.id, ownerName: 'Du', isSelf: true,
      activityCount: ownWeek.length,
      totalMovingTimeSec: ownWeek.reduce((s, a) => s + (a.moving_time ?? 0), 0),
      totalDistanceM: ownWeek.reduce((s, a) => s + (a.distance ?? 0), 0),
    },
    ...friendWeek.map(f => ({ ownerId: f.ownerId, ownerName: f.ownerName, isSelf: false, activityCount: f.activityCount, totalMovingTimeSec: f.totalMovingTimeSec, totalDistanceM: f.totalDistanceM })),
  ].sort((a, b) => b.totalMovingTimeSec - a.totalMovingTimeSec)

  const feedDeduped = dedupeFriendFeed(friendFeed as FriendFeedRow[] | null)
  // Rekordmärken är färdigräknade i activity_records (uppdateras av cron när pass ändras).
  const { data: recordRows } = feedDeduped.length > 0
    ? await supabase.from('activity_records').select('activity_id, label').in('activity_id', feedDeduped.map(e => e.activity_id))
    : { data: [] as { activity_id: string; label: string }[] }
  const records = new Map<string, string[]>()
  for (const r of recordRows ?? []) records.set(r.activity_id, [...(records.get(r.activity_id) ?? []), r.label])
  const feedWithRecords = feedDeduped.map(e => ({ ...e, records: records.get(e.activity_id) ?? [] }))

  const people = [
    { ownerId: user.id, ownerName: 'Du', isSelf: true },
    ...roster.map(r => ({ ownerId: r.owner_id, ownerName: r.owner_name, isSelf: false })),
  ]
  // Vid fel visas bara veckan (FriendPeriodCard hanterar null) hellre än felaktiga summor.
  const periods = monthlyError ? null : periodsFromMonthly((monthlyRows ?? []) as MonthlyRow[], people)

  return (
    <div className="p-4 md:p-8 max-w-2xl w-full mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Vänner</h1>
        <p className="text-muted text-sm mt-1">Se hur länge och långt ni tränat, heja på varandra och håll koll på rekord.</p>
      </div>

      {roster.length === 0 ? (
        <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
          <p className="text-fg text-sm">Du har inga vänner kopplade än. Sök upp någon under Profil så dyker deras pass och summor upp här.</p>
          <Link href="/dashboard/profil" className="text-xs text-accent border border-accent/30 rounded-lg px-4 py-2 self-start">Lägg till vänner</Link>
        </div>
      ) : (
        <FriendPeriodCard weekRows={weekRows} people={periods} todayKey={stockholmDateKey()} />
      )}

      <FriendFeed feed={feedWithRecords} userId={user.id} />

      {roster.length > 0 && (
        <Link href="/dashboard/profil" className="text-xs text-muted text-center hover:text-fg transition-colors">Hantera vänner och förfrågningar i Profil</Link>
      )}
    </div>
  )
}
