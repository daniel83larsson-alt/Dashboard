import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { refreshDirtyUsers, reconcileAllUsers } from '@/lib/records-store'
import { sessionsOf, recordLabelsBySession } from '@/lib/records-engine'
import { newRecordsForLatest } from '@/lib/records'
import type { ActivityRow } from '@/lib/duplicates'

export const maxDuration = 60

// Rekord- och månadstabellerna (activity_records, activity_monthly) hålls uppdaterade här.
//  ?mode=dirty (standard)  räknar om användare vars pass ändrats (satt av trigger på activities)
//  ?mode=reconcile         dagligt: räknar om ALLA och larmar om något behövde rättas
//  ?mode=legacy-check      engångskontroll: jämför nya motorn mot den gamla newRecordsForLatest på riktig data
// Auth: CRON_SECRET eller SCHEDULER_SECRET (lib/cron-auth.ts).

async function alertDiscord(content: string) {
  const url = process.env.SIGNUP_NOTIFY_WEBHOOK_URL
  if (!url) return
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) }).catch(() => {})
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createSupabaseAdminClient()
  const mode = request.nextUrl.searchParams.get('mode') ?? 'dirty'

  if (mode === 'legacy-check') {
    const { data: profiles } = await admin.from('profiles').select('id')
    const report: { userId: string; sessions: number; withRecords: number; mismatches: number }[] = []
    for (const p of profiles ?? []) {
      const { data } = await admin.from('activities')
        .select('id, strava_id, start_date, distance, moving_time, sport_type, source, calories').eq('user_id', p.id).limit(5000)
      const sessions = sessionsOf(((data ?? []) as ActivityRow[]).map(r => ({ ...r, distance: Number(r.distance ?? 0) })))
      const fast = recordLabelsBySession(sessions)
      let mismatches = 0
      for (const s of sessions) {
        const t = Date.parse(s.start_date)
        const legacy = newRecordsForLatest(s, sessions.filter(o => o.id !== s.id && Date.parse(o.start_date) < t))
        const got = fast.get(s.id) ?? []
        if (legacy.length !== got.length || legacy.some((l, i) => l !== got[i])) mismatches++
      }
      report.push({ userId: p.id, sessions: sessions.length, withRecords: fast.size, mismatches })
    }
    return NextResponse.json({ ranAt: new Date().toISOString(), mode, totalMismatches: report.reduce((s, r) => s + r.mismatches, 0), report })
  }

  if (mode === 'reconcile') {
    // Först de smutsiga (normalfallet), sedan alla för att fånga det som ändå missats.
    await refreshDirtyUsers(admin, 20)
    const r = await reconcileAllUsers(admin)
    if (r.drift.length || r.failed.length) {
      await alertDiscord(`⚠️ **Rekordavstämning**: ${r.drift.length} användare hade avvikelser som rättades (${r.drift.map(d => d.changed).join(', ')} rader), ${r.failed.length} misslyckades. Uppdateringen via ändringsmarkering har missat något.`)
    }
    return NextResponse.json({ ranAt: new Date().toISOString(), mode, ...r })
  }

  const r = await refreshDirtyUsers(admin, 5)
  return NextResponse.json({ ranAt: new Date().toISOString(), mode, processed: r.processed.length, failed: r.failed, remaining: r.remaining })
}
