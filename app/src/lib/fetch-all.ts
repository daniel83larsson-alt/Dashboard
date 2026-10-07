// PostgREST svarar med högst 1000 rader per anrop (projektets standard). Sidor som läser hela
// passhistoriken (streaks, rekord, kalender) skulle annars tyst få en avkapad historik när någon
// passerat 1000 pass — rätt siffror idag (störst: ~900), fel utan felmeddelande om några månader.
// Hämtar sida för sida tills en kort sida kommer. `page` får gärna ge ett färdigt query-objekt
// med .range(from, to) — se användning i dashboard/page.tsx.
const PAGE_SIZE = 1000
const MAX_PAGES = 20 // hård broms mot oändlig loop (20 000 rader)

export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = PAGE_SIZE,
): Promise<{ data: T[]; complete: boolean }> {
  const rows: T[] = []
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(i * pageSize, i * pageSize + pageSize - 1)
    if (error || !data) return { data: rows, complete: false }
    rows.push(...data)
    if (data.length < pageSize) return { data: rows, complete: true }
  }
  return { data: rows, complete: false }
}
