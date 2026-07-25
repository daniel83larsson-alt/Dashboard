// Locks in the iOS Mail dark-header-inversion fix (e193419): all three
// email templates once shipped without a color-scheme meta tag, so iOS
// Mail's automatic dark-mode inverted the dark header band into something
// unreadable. Asserts presence of the fix's markers via toContain (not
// toMatchSnapshot — a full-HTML snapshot churns on every copy tweak and
// gets rubber-stamped, which defeats the point of a regression test here).
import { describe, it, expect } from 'vitest'
import { renderWeeklyDigestHtml } from './weekly-digest-email'
import { renderNewsletterHtml } from './newsletter'
import { renderFeatureShowcaseHtml } from './feature-showcase-email'
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
    },
    insights: { sessions: 'Bra vecka med jämna pass.', wellness: 'Sömnen såg stabil ut.', motivation: 'Kör på mot målet!' },
    viewedAt: null,
  }

  it('renders a valid, dark-mode-safe HTML document', () => {
    const html = renderWeeklyDigestHtml({ name: 'Jonas', record, unsubscribeUrl: 'https://dltrainer.se/api/weekly-digest/unsubscribe?uid=1' })
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
