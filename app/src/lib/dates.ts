// Monday 00:00 local time of the week containing `d` (Swedish weeks start Monday).
export function startOfWeek(d: Date): Date {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  const day = date.getDay() // 0=sön, 1=mån, ... 6=lör
  const diff = day === 0 ? 6 : day - 1
  date.setDate(date.getDate() - diff)
  return date
}

// The calorie card needs actual Europe/Stockholm wall-clock time, not the
// server's own local time (Vercel runs UTC — a plain new Date() day boundary
// would land at 01-02 svensk tid, which is fine for most of the app's
// "roughly today" comparisons but wrong for pro-rating a full day's BMR).
function stockholmParts(d: Date) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  return { y: get('year'), mo: get('month'), da: get('day'), h: get('hour'), mi: get('minute'), s: get('second') }
}

// "YYYY-MM-DD" for the given instant in Swedish local time — used to compare
// against a stored timestamptz's date-portion for "is this today".
export function stockholmDateKey(d: Date = new Date()): string {
  const p = stockholmParts(d)
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.da).padStart(2, '0')}`
}

// Fraction of the current Swedish-local day elapsed (0..1) — pro-rates BMR
// so "förbränt idag" doesn't show a full day's resting burn at breakfast.
export function stockholmDayElapsedFraction(d: Date = new Date()): number {
  const p = stockholmParts(d)
  return (p.h * 3600 + p.mi * 60 + p.s) / 86400
}

// "Idag"/"Igår" for recent dates, full weekday+date for anything older —
// long lists (Passlogg) read a lot faster with this than a full date on
// every row. Compares Swedish-local calendar days, not server-local ones.
export function relativeDateLabel(iso: string, now: Date = new Date()): string {
  const todayKey = stockholmDateKey(now)
  const dateKey = stockholmDateKey(new Date(iso))
  if (dateKey === todayKey) return 'Idag'
  if (dateKey === stockholmDateKey(new Date(now.getTime() - 86400000))) return 'Igår'
  return new Date(iso).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
