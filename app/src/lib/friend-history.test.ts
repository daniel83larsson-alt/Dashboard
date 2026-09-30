import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { fetchFriendHistory } from './friend-history'
import type { FriendHistoryRow } from './friend-records'

function fakeRow(i: number): FriendHistoryRow {
  return { activity_id: `a-${i}`, owner_id: 'o', sport_type: 'Run', distance: 5000, moving_time: 1500, start_date: '2026-09-01T08:00:00Z', source: 'garmin', strava_id: i }
}

// The REAL supabase-js client (so the request the page will actually send is
// what's tested — URL, params, body), pointed at a fake PostgREST that pages
// exactly the way the real one does: offset/limit query params, with the
// server-side 1000-row cap applied even if a larger limit is asked for.
function clientAgainst(server: (offset: number, limit: number) => { status: number; rows: unknown[] }, seen: { url: URL; body: unknown }[]) {
  return createClient('https://example.supabase.co', 'anon-key', {
    global: {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
        seen.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
        const offset = Number(url.searchParams.get('offset') ?? 0)
        const limit = Math.min(Number(url.searchParams.get('limit') ?? 1000), 1000)
        const { status, rows } = server(offset, limit)
        return new Response(JSON.stringify(status === 200 ? rows : { message: 'boom' }), { status, headers: { 'Content-Type': 'application/json' } })
      },
    },
  })
}

describe('fetchFriendHistory', () => {
  it('asks the existing friend_weekly_activities RPC for an unbounded range and returns a single short page as complete', async () => {
    const all = Array.from({ length: 3 }, (_, i) => fakeRow(i))
    const seen: { url: URL; body: unknown }[] = []
    const client = clientAgainst((o, l) => ({ status: 200, rows: all.slice(o, o + l) }), seen)

    const result = await fetchFriendHistory(client)

    expect(result.complete).toBe(true)
    expect(result.data).toHaveLength(3)
    expect(seen).toHaveLength(1)
    expect(seen[0].url.pathname).toBe('/rest/v1/rpc/friend_weekly_activities')
    expect(seen[0].body).toEqual({ week_start: '1970-01-01T00:00:00Z', week_end: '2100-01-01T00:00:00Z' })
  })

  it('keeps paging past the 1000-row server cap and returns everything, exactly once', async () => {
    const all = Array.from({ length: 2300 }, (_, i) => fakeRow(i))
    const seen: { url: URL; body: unknown }[] = []
    const client = clientAgainst((o, l) => ({ status: 200, rows: all.slice(o, o + l) }), seen)

    const result = await fetchFriendHistory(client)

    expect(result.complete).toBe(true)
    expect(result.data).toHaveLength(2300)
    expect(new Set(result.data.map(r => r.activity_id)).size).toBe(2300)
    expect(seen.map(s => s.url.searchParams.get('offset'))).toEqual(['0', '1000', '2000'])
  })

  it('an exact multiple of the page size ends on an empty page rather than looping forever', async () => {
    const all = Array.from({ length: 1000 }, (_, i) => fakeRow(i))
    const seen: { url: URL; body: unknown }[] = []
    const client = clientAgainst((o, l) => ({ status: 200, rows: all.slice(o, o + l) }), seen)

    const result = await fetchFriendHistory(client)

    expect(result.complete).toBe(true)
    expect(result.data).toHaveLength(1000)
    expect(seen).toHaveLength(2)
  })

  it('reports incomplete (so the caller shows NO badges rather than wrong ones) when any page fails', async () => {
    const all = Array.from({ length: 2300 }, (_, i) => fakeRow(i))
    const seen: { url: URL; body: unknown }[] = []
    const client = clientAgainst((o, l) => o >= 1000 ? { status: 500, rows: [] } : { status: 200, rows: all.slice(o, o + l) }, seen)

    const result = await fetchFriendHistory(client)

    expect(result.complete).toBe(false)
  })

  it('a row that shows up on two pages (ties in the RPC ordering) is counted once', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => fakeRow(i))
    const page2 = [fakeRow(999), fakeRow(1000)] // 999 repeated across the boundary
    const seen: { url: URL; body: unknown }[] = []
    const client = clientAgainst(o => ({ status: 200, rows: o === 0 ? page1 : page2 }), seen)

    const result = await fetchFriendHistory(client)

    expect(result.complete).toBe(true)
    expect(result.data).toHaveLength(1001)
  })
})
