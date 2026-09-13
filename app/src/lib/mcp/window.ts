// Shared by every MCP tool that needs a rolling N-day window ending today —
// same rolling-not-calendar-week convention as viktmal/page.tsx's own
// `dateKeysEndingToday` (see STATUS.md: Daniel confirmed the 7-day average
// should be a rolling window, not Mon-Sun).
export function dateKeysEndingToday(todayKey: string, count: number): string[] {
  const end = new Date(`${todayKey}T00:00:00`)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(end)
    d.setDate(d.getDate() - (count - 1 - i))
    return d.toISOString().slice(0, 10)
  })
}
