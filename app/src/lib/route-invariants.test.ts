// Codebase-invariant checks — plain string-content assertions against
// source files on disk (no AST parsing). These catch a whole incident CLASS
// (a new route shipping without auth, without CRON_SECRET, without the
// dark-mode email fix, etc.) rather than one specific past bug, by re-
// deriving "which files currently match/don't match" from the real tree on
// every run instead of hardcoding an assumption that silently drifts.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// vitest.config.ts has no explicit `root`, so process.cwd() is the app/
// directory it's invoked from (both locally and in CI) — avoids relying on
// __dirname, which isn't guaranteed available under every module target.
const SRC_ROOT = path.join(process.cwd(), 'src')
const API_ROOT = path.join(SRC_ROOT, 'app', 'api')

function walk(dir: string, filter: (p: string) => boolean, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, filter, acc)
    else if (filter(full)) acc.push(full)
  }
  return acc
}

function relToSrc(p: string): string {
  return path.relative(SRC_ROOT, p).split(path.sep).join('/')
}

function read(p: string): string {
  return fs.readFileSync(p, 'utf8')
}

const allRouteFiles = walk(API_ROOT, p => p.endsWith(path.join('route.ts')))
  .sort()

describe('every API route requires auth unless explicitly allowlisted', () => {
  // Verified against the real tree via
  // `grep -rL "getUser" src/app/api --include=route.ts` — these are routes
  // that legitimately don't call auth.getUser(): the cron jobs (authenticated
  // via CRON_SECRET instead, see the cron describe block below) and three
  // one-off routes that are meant to be reachable without a session
  // (unsubscribe links from emails, and the Supabase auth webhook).
  const ALLOWLIST = [
    'app/api/cron/streak-reminder/route.ts',
    'app/api/cron/isolation-check/route.ts',
    'app/api/cron/prod-smoke/route.ts',
    'app/api/cron/weekly-digest/route.ts',
    'app/api/cron/sync-all/route.ts',
    'app/api/weekly-digest/unsubscribe/route.ts',
    'app/api/webhooks/new-signup/route.ts',
    'app/api/newsletter/unsubscribe/route.ts',
  ]

  for (const file of allRouteFiles) {
    const rel = relToSrc(file)
    const label = rel.replace(/^app\/api\//, 'api/')
    if (ALLOWLIST.includes(rel)) continue
    it(`${label} calls getUser()`, () => {
      expect(read(file)).toMatch(/getUser\s*\(/)
    })
  }

  it('the allowlist itself only contains files that are actually missing getUser() (no stale entries)', () => {
    for (const rel of ALLOWLIST) {
      const full = path.join(SRC_ROOT, rel)
      expect(fs.existsSync(full), `${rel} no longer exists — remove it from the allowlist`).toBe(true)
      expect(read(full), `${rel} now calls getUser() — remove it from the allowlist`).not.toMatch(/getUser\s*\(/)
    }
  })
})

describe('every cron route requires CRON_SECRET', () => {
  const cronFiles = allRouteFiles.filter(f => relToSrc(f).startsWith('app/api/cron/'))

  it('found the expected cron routes (sanity check that the walk didn\'t silently return nothing)', () => {
    expect(cronFiles.length).toBeGreaterThanOrEqual(4)
  })

  for (const file of cronFiles) {
    it(`${relToSrc(file).replace(/^app\//, '')} contains CRON_SECRET`, () => {
      expect(read(file)).toContain('CRON_SECRET')
    })
  }
})

describe('every admin route requires ADMIN_EMAIL', () => {
  const adminFiles = allRouteFiles.filter(f => relToSrc(f).startsWith('app/api/admin/'))

  it('found the expected admin routes (sanity check that the walk didn\'t silently return nothing)', () => {
    expect(adminFiles.length).toBeGreaterThanOrEqual(1)
  })

  for (const file of adminFiles) {
    it(`${relToSrc(file).replace(/^app\//, '')} contains ADMIN_EMAIL`, () => {
      expect(read(file)).toContain('ADMIN_EMAIL')
    })
  }
})

describe('every renderXHtml email template carries the dark-mode color-scheme fix', () => {
  // Generalizes the email-templates.test.ts regression test: scans all of
  // src/lib for a function name matching /render.*Html/ and asserts its
  // FILE contains color-scheme, so a future 4th template can't ship
  // without the iOS Mail dark-header fix silently.
  const LIB_ROOT = path.join(SRC_ROOT, 'lib')
  const libFiles = walk(LIB_ROOT, p => p.endsWith('.ts') && !p.endsWith('.test.ts'))
  const renderHtmlFnPattern = /export\s+(?:async\s+)?function\s+(render\w*Html)\s*\(/

  const filesWithRenderHtmlFns = libFiles.filter(f => renderHtmlFnPattern.test(read(f)))

  it('found the expected render*Html template files (sanity check)', () => {
    expect(filesWithRenderHtmlFns.length).toBeGreaterThanOrEqual(3)
  })

  for (const file of filesWithRenderHtmlFns) {
    it(`${relToSrc(file).replace(/^lib\//, '')} contains color-scheme`, () => {
      expect(read(file)).toContain('color-scheme')
    })
  }
})

describe('every known Garmin-fetching call site is wrapped in withGarminLock', () => {
  // Verified against the real tree via `grep -rl withGarminLock src/app`.
  const KNOWN_CALL_SITES = [
    'app/api/activities/sync-garmin/route.ts',
    'app/api/cron/sync-all/route.ts',
    'app/api/admin/test-garmin/route.ts',
  ]

  for (const rel of KNOWN_CALL_SITES) {
    it(`${rel.replace(/^app\//, '')} contains withGarminLock`, () => {
      const full = path.join(SRC_ROOT, rel)
      expect(fs.existsSync(full), `${rel} no longer exists`).toBe(true)
      expect(read(full)).toContain('withGarminLock')
    })
  }
})

describe('every route that calls Gemini directly is rate-limited (or is a cron route with its own throttling)', () => {
  // Two ways a route ends up calling Gemini: an inline raw fetch to
  // generativelanguage.googleapis.com (food/estimate, insights/*, plan/
  // generate — each has its own request shape, e.g. image input or
  // structured-output mode, so they aren't good candidates to share a
  // helper), or a call to lib/llm.ts's shared callGemini() (coach, food/
  // feedback — both send a plain system-prompt + history + message and
  // have nothing shape-specific to duplicate). Detected as the union of
  // both patterns — verified against the real tree via
  // `grep -rl 'generativelanguage.googleapis.com\|callGemini(' src/app/api --include=route.ts`.
  // All six current call sites are interactive (user-triggered) routes,
  // none of them cron routes — the weekly-digest cron generates via
  // lib/weekly-digest-generate.ts, which is throttled separately in the
  // cron route itself rather than via the interactive limiter (see that
  // file's comments), and it isn't a route.ts so it's out of scope here.
  const GEMINI_CALL_SITES = [
    'app/api/coach/route.ts',
    'app/api/plan/generate/route.ts',
    'app/api/food/estimate/route.ts',
    'app/api/food/feedback/route.ts',
    'app/api/insights/health/route.ts',
    'app/api/insights/generate/route.ts',
  ]

  it('the hardcoded call-site list still matches what actually calls Gemini in route.ts files (no drift)', () => {
    const actual = allRouteFiles
      .filter(f => { const c = read(f); return c.includes('generativelanguage.googleapis.com') || /callGemini\s*\(/.test(c) })
      .map(relToSrc)
      .sort()
    expect(actual).toEqual([...GEMINI_CALL_SITES].sort())
  })

  for (const rel of GEMINI_CALL_SITES) {
    it(`${rel.replace(/^app\//, '')} is rate-limited or is a cron route`, () => {
      const full = path.join(SRC_ROOT, rel)
      const isCron = rel.startsWith('app/api/cron/')
      const content = read(full)
      const isRateLimited = content.includes('checkAndConsumeRateLimit') || content.includes('rate-limit')
      expect(isCron || isRateLimited).toBe(true)
    })
  }
})

describe('proxy.ts', () => {
  const proxyFile = path.join(SRC_ROOT, 'proxy.ts')
  const content = read(proxyFile)

  it('sets no-store on responses', () => {
    expect(content).toContain('no-store')
  })

  it('exports a config.matcher that still covers /dashboard', () => {
    expect(content).toMatch(/matcher\s*[:=][\s\S]*\/dashboard/)
  })
})
