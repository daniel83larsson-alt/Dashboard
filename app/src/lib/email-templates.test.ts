// Locks in the iOS Mail dark-header-inversion fix (e193419): the original
// three email templates once shipped without a color-scheme meta tag, so iOS
// Mail's automatic dark-mode inverted the dark header band into something
// unreadable. Asserts presence of the fix's markers via toContain (not
// toMatchSnapshot — a full-HTML snapshot churns on every copy tweak and
// gets rubber-stamped, which defeats the point of a regression test here).
import { describe, it, expect } from 'vitest'
import { renderWeeklyDigestHtml } from './weekly-digest-email'
import { renderNewsletterHtml } from './newsletter'
import { renderFeatureShowcaseHtml } from './feature-showcase-email'
import { renderResetPasswordHtml } from './reset-password-email'
import type { WeeklyDigestRecord } from './weekly-digest-generate'
import type { PersonalStats } from './newsletter'

function expectDarkModeSafe(html: string) {
  expect(html.toLowerCase()).toContain('<!doctype html')
  expect(html).toContain('<head')
  expect(html).toContain('<meta name="color-scheme" content="light">')
  expect(html).toContain('supported-color-schemes')
}

describe('renderWeeklyDigestHtml', () => {
  const record: WeeklyDigestRecord = {
    generatedAt: '2026-07-19T18:00:00Z',
    weekStartISO: '2026-07-13',
    weekEndISO: '2026-07-19',
    data: {
      weekStartISO: '2026-07-13',
      weekEndISO: '2026-07-19',
      thisWeek: {
        sessions: { count: 3, totalKm: 21.5, totalMinutes: 180, bySport: [{ sport: 'Run', label: 'Löpning', count: 3 }] },
        wellness: { avgSteps: 8500, avgSleepHours: 7.2, avgRestingHR: 52, avgHrv: 45 },
      },
      prevWeek: {
        sessions: { count: 2, totalKm: 15, totalMinutes: 120, bySport: [{ sport: 'Run', label: 'Löpning', count: 2 }] },
        wellness: { avgSteps: 7800, avgSleepHours: 7.0, avgRestingHR: 53, avgHrv: 44 },
      },
      adherence: { plannedCount: 3, doneCount: 3, label: 'Du körde alla 3 planerade pass.' },
      lookAhead: { kind: 'plan', sessions: [{ sport: 'Run', label: 'Löpning', title: 'Lugn löptur', plannedDate: '2026-07-20', isRest: false }] },
      bestSession: { activityId: 'a1', sport: 'Run', label: 'Löpning', startDate: '2026-07-16T06:00:00Z', distanceKm: 10, minutes: 55, load: 42 },
      newRecords: [{ activityId: 'a1', sport: 'Run', label: 'Löpning', startDate: '2026-07-16T06:00:00Z', records: ['Snabbaste 10 km'] }],
    },
    kost: null,
    deficit: null,
    insights: { sessions: 'Bra vecka med jämna pass.', wellness: 'Sömnen såg stabil ut.', motivation: 'Kör på mot målet!', nutrition: null },
    viewedAt: null,
  }

  it('renders a valid, dark-mode-safe HTML document', () => {
    const html = renderWeeklyDigestHtml({ name: 'Jonas', record, unsubscribeUrl: 'https://dltrainer.se/api/weekly-digest/unsubscribe?uid=1' })
    expectDarkModeSafe(html)
  })

  it('skips the Kost section entirely when there is no nutrition data this week', () => {
    const html = renderWeeklyDigestHtml({ name: 'Jonas', record, unsubscribeUrl: 'https://dltrainer.se/api/weekly-digest/unsubscribe?uid=1' })
    expect(html).not.toContain('Kost denna vecka')
  })

  it('renders the Kost section for a YAZIO-only user with no training data (e.g. Rawa)', () => {
    const kostOnlyRecord: WeeklyDigestRecord = {
      ...record,
      data: {
        ...record.data,
        thisWeek: { sessions: { count: 0, totalKm: 0, totalMinutes: 0, bySport: [] }, wellness: { avgSteps: null, avgSleepHours: null, avgRestingHR: null, avgHrv: null } },
        adherence: null,
        bestSession: null,
        newRecords: [],
      },
      kost: {
        source: 'yazio', daysWithData: 6, daysFlagged: 1, avgKcal: 2100, kcalGoal: 2200, daysWithinKcalGoal: 5, prevWeekAvgKcal: 2300,
        avgProteinG: 110, proteinGoalG: 120, avgCarbG: 220, carbGoalG: null, avgFatG: 70, fatGoalG: null,
        weightStartKg: 82.4, weightEndKg: 81.9, avgWaterMl: 1800, waterGoalMl: 2000, mostSkippedMeal: 'Kvällsmat',
      },
      insights: { sessions: 'Inga pass loggade denna vecka.', wellness: 'Ingen stegdata denna vecka.', motivation: 'Bygg vidare på din kostrutin!', nutrition: 'Bra koll på kalorierna — snittet på 2100 kcal ligger nära målet 5 av 6 dagar.' },
    }
    const html = renderWeeklyDigestHtml({ name: 'Rawa', record: kostOnlyRecord, unsubscribeUrl: 'https://dltrainer.se/api/weekly-digest/unsubscribe?uid=1' })
    expect(html).toContain('Kost denna vecka (YAZIO)')
    expect(html).toContain('82.4 kg → 81.9 kg')
    expect(html).toContain('Loggas sällan: kvällsmat')
    expect(html).toContain('Bra koll på kalorierna')
    expectDarkModeSafe(html)
  })
})

describe('renderNewsletterHtml', () => {
  const stats: PersonalStats = { weekCount: 3, weekDistance: 21500, weekTime: 10800, dailyStreak: 4, weeklyStreak: 2 }

  it('renders a valid, dark-mode-safe HTML document', () => {
    const html = renderNewsletterHtml({ name: 'Jessica', appNews: 'Vi har lagt till en ny funktion.', stats, unsubscribeUrl: 'https://dltrainer.se/api/newsletter/unsubscribe?uid=1' })
    expectDarkModeSafe(html)
  })
})

describe('renderFeatureShowcaseHtml', () => {
  it('renders a valid, dark-mode-safe HTML document', () => {
    const html = renderFeatureShowcaseHtml({ name: 'Fredrik', wrongVersionNote: false, unsubscribeUrl: 'https://dltrainer.se/api/newsletter/unsubscribe?uid=1' })
    expectDarkModeSafe(html)
  })

  it('still renders dark-mode-safe with the wrongVersionNote branch on', () => {
    const html = renderFeatureShowcaseHtml({ name: 'Fredrik', wrongVersionNote: true, unsubscribeUrl: 'https://dltrainer.se/api/newsletter/unsubscribe?uid=1' })
    expectDarkModeSafe(html)
  })
})

describe('renderResetPasswordHtml', () => {
  it('renders a valid, dark-mode-safe HTML document', () => {
    const html = renderResetPasswordHtml({ resetUrl: 'https://dltrainer.se/auth/reset-password/new?token_hash=abc123&type=recovery' })
    expectDarkModeSafe(html)
  })

  it('includes the real reset link, not a placeholder', () => {
    const html = renderResetPasswordHtml({ resetUrl: 'https://dltrainer.se/auth/reset-password/new?token_hash=abc123&type=recovery' })
    expect(html).toContain('https://dltrainer.se/auth/reset-password/new?token_hash=abc123&type=recovery')
  })
})
