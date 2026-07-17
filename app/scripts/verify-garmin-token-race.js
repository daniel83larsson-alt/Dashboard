#!/usr/bin/env node
// Investigation script for a suspected cross-user data-leak mechanism in
// garmin-connect's HttpClient (module-level isRefreshing/refreshSubscribers
// shared across every user's session instead of per-instance — see
// STATUS.md). A static code read suggested this could hand user B's retried
// request user A's freshly-refreshed OAuth2 token.
//
// RESULT OF ACTUALLY RUNNING THIS (not just reading the code): it does NOT
// reproduce a data leak. HttpClient's REQUEST interceptor unconditionally
// re-stamps `Authorization: Bearer <this.oauth2Token.access_token>` on every
// outgoing call — including the retry — using the CURRENT instance's own
// (per-instance, never-shared) oauth2Token field. So even though B's request
// can queue on A's shared refreshSubscribers and receive A's token via the
// resolve callback, that borrowed value gets overwritten before the retry
// is actually sent, using B's own (still-stale) token instead. B's retry
// then re-401s, which — because `_retry` is only ever set on the path that
// does its OWN refresh, never on the queued/borrowed path — loops back
// through the interceptor and self-heals: B ends up doing its own real
// refresh and correctly receives its own data, just after an extra
// round-trip. Confirmed empirically below: both requests always resolve
// with their own owner's data; no cross-contamination observed.
//
// Conclusion: this IS a real defect (wasted latency, and a genuine
// instance-isolation violation worth fixing on principle), but it is NOT
// confirmed to be the cause of the "synced but it wasn't my numbers" user
// reports — that root cause is still open. withGarminLock (lib/garmin.ts)
// stays in place as a blanket precaution regardless, since it can't hurt
// and may be masking some other concurrency-dependent issue not yet found.
//
// Run: node scripts/verify-garmin-token-race.js
// Exit 0 = each instance only ever received its own data (current result).
// Exit 1 = a cross-user leak or an infinite-retry loop was observed — if
// this ever happens after a garmin-connect version bump, investigate before
// assuming the library is still safe.

const { HttpClient } = require('garmin-connect/dist/common/HttpClient')

// Simulated Garmin backend: only *_REFRESHED tokens are valid; original
// tokens are already expired, forcing an initial 401 for both users.
const VALID_TOKENS = { A_REFRESHED: 'A', B_REFRESHED: 'B' }
const MAX_ATTEMPTS_PER_REQUEST = 6 // safety cap — hitting this indicates an infinite-retry bug, not a leak

function makeInstance(label) {
  const client = new HttpClient('https://example.invalid')
  client.oauth2Token = { access_token: `${label}_ORIGINAL`, expires_at: Date.now() + 3600_000 }

  let refreshGateResolve
  const refreshGate = new Promise(resolve => { refreshGateResolve = resolve })
  let refreshCalls = 0

  client.refreshOauth2Token = async function () {
    refreshCalls++
    if (label === 'A') await refreshGate // A's refresh is slow/in-flight, released explicitly by the test
    this.oauth2Token = { access_token: `${label}_REFRESHED`, expires_at: Date.now() + 3600_000 }
  }

  let attempts = 0
  client.client.defaults.adapter = async (config) => {
    attempts++
    if (attempts > MAX_ATTEMPTS_PER_REQUEST) {
      throw new Error(`${label}: exceeded ${MAX_ATTEMPTS_PER_REQUEST} attempts — likely infinite retry loop`)
    }
    const token = (config.headers.Authorization || '').replace(/^Bearer\s+/, '')
    const owner = VALID_TOKENS[token]
    if (!owner) {
      const err = new Error('Request failed with status code 401')
      err.isAxiosError = true
      err.config = config
      err.response = { status: 401, data: {}, headers: {}, config }
      throw err
    }
    return { status: 200, data: { owner }, headers: {}, config }
  }

  return { label, client, releaseRefresh: () => refreshGateResolve(), getRefreshCalls: () => refreshCalls }
}

async function main() {
  const a = makeInstance('A')
  const b = makeInstance('B')

  // A's request 401s (ORIGINAL is invalid), starts refreshing, blocks on A's gate.
  const aResultPromise = a.client.client.get('/protected')
  await new Promise(r => setTimeout(r, 20)) // let A reach "refreshing in progress" before B starts

  // B's request 401s while A's refresh is still in flight — the exact
  // precondition for the shared isRefreshing/refreshSubscribers bug.
  const bResultPromise = b.client.client.get('/protected')
  await new Promise(r => setTimeout(r, 20))

  // Release A's refresh — this is the moment the shared refreshSubscribers
  // queue (pre-patch) gets flushed with A's token.
  a.releaseRefresh()

  const results = await Promise.allSettled([aResultPromise, bResultPromise])
  const [aResult, bResult] = results

  const describe = (r) => r.status === 'fulfilled' ? `owner=${r.value.data.owner}` : `REJECTED (${r.reason.message})`
  console.log(`A's request resolved with: ${describe(aResult)} (A refreshed its own token ${a.getRefreshCalls()}x)`)
  console.log(`B's request resolved with: ${describe(bResult)} (B refreshed its own token ${b.getRefreshCalls()}x)`)

  const bGotAsData = bResult.status === 'fulfilled' && bResult.value.data.owner === 'A'
  const aGotBsData = aResult.status === 'fulfilled' && aResult.value.data.owner === 'B'
  const aOk = aResult.status === 'fulfilled' && aResult.value.data.owner === 'A'
  const bOk = bResult.status === 'fulfilled' && bResult.value.data.owner === 'B'

  if (bGotAsData || aGotBsData) {
    console.log(`\n✗ CROSS-USER DATA LEAK REPRODUCED — a request resolved with a DIFFERENT user's data.`)
    process.exit(1)
  } else if (!aOk || !bOk) {
    console.log(`\n✗ At least one request failed/rejected instead of resolving with its own correct data (not a silent leak, but a real defect — investigate before declaring this fixed).`)
    process.exit(1)
  } else {
    console.log('\n✓ Both requests resolved with their own correct data — no cross-user leak, no failure.')
    process.exit(0)
  }
}

main().catch(err => {
  console.error('Verification script crashed:', err)
  process.exit(2)
})
