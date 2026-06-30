// Monday 00:00 local time of the week containing `d` (Swedish weeks start Monday).
export function startOfWeek(d: Date): Date {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  const day = date.getDay() // 0=sön, 1=mån, ... 6=lör
  const diff = day === 0 ? 6 : day - 1
  date.setDate(date.getDate() - diff)
  return date
}
