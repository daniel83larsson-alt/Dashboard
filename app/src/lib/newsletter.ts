import { currentDailyStreak, currentWeeklyStreak } from './streaks'
import { startOfWeek } from './dates'

type Activity = { id: string; start_date: string; distance: number; moving_time: number; sport_type: string }

export type PersonalStats = {
  weekCount: number
  weekDistance: number
  weekTime: number
  dailyStreak: number
  weeklyStreak: number
}

function fmtKm(m: number) { return (m / 1000).toFixed(1) + ' km' }
function fmtDur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

export function computePersonalStats(activities: Activity[]): PersonalStats {
  const weekStart = startOfWeek(new Date())
  const thisWeek = activities.filter(a => new Date(a.start_date) >= weekStart)
  return {
    weekCount: thisWeek.length,
    weekDistance: thisWeek.reduce((s, a) => s + (a.distance ?? 0), 0),
    weekTime: thisWeek.reduce((s, a) => s + (a.moving_time ?? 0), 0),
    dailyStreak: currentDailyStreak(activities),
    weeklyStreak: currentWeeklyStreak(activities),
  }
}

// A hand-picked line so the "lite personligt" part actually reads as
// written for the person, not a robotic stats dump — varies by what's
// actually true for them this week rather than always saying the same
// thing regardless of activity level.
function personalLine(stats: PersonalStats): string {
  if (stats.weekCount === 0 && stats.dailyStreak === 0) {
    return 'Inga pass loggade den senaste veckan — dags att komma igång igen?'
  }
  if (stats.dailyStreak >= 3) {
    return `Du har ${stats.dailyStreak} dagar i rad just nu — snyggt jobbat! 🔥`
  }
  if (stats.weekCount > 0) {
    return `Den här veckan: ${stats.weekCount} pass${stats.weekDistance > 0 ? `, ${fmtKm(stats.weekDistance)}` : ''} · ${fmtDur(stats.weekTime)}.`
  }
  return 'Ingen aktivitet denna vecka än — hoppas vi ses på passloggen snart!'
}

export function renderNewsletterHtml({
  name,
  appNews,
  stats,
  unsubscribeUrl,
}: {
  name: string
  appNews: string
  stats: PersonalStats
  unsubscribeUrl: string
}): string {
  const appNewsHtml = appNews
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => `<p style="margin:0 0 12px;color:#1a1a1a;line-height:1.5;">${line}</p>`)
    .join('')

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f4f4f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#0e1113;padding:24px 32px;">
          <span style="color:#ccd400;font-size:22px;font-weight:700;">DL Trainer</span>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 16px;color:#1a1a1a;font-size:15px;">Hej ${name}!</p>
          ${appNewsHtml}
          <div style="margin:20px 0;padding:16px;background:#f4f4f2;border-radius:12px;">
            <p style="margin:0;color:#1a1a1a;font-size:14px;">${personalLine(stats)}</p>
          </div>
          <p style="margin:20px 0 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="display:inline-block;background:#ccd400;color:#0e1113;padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">Öppna DL Trainer</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #eee;">
          <p style="margin:0;color:#999;font-size:11px;">
            Vill du inte längre få de här mejlen? <a href="${unsubscribeUrl}" style="color:#999;">Avsluta prenumeration</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
