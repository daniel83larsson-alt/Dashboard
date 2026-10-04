import { describe, it, expect, beforeEach } from 'vitest'
import { isCronAuthorized } from './cron-auth'

const req = (auth?: string) => new Request('https://x.test', { headers: auth ? { authorization: auth } : {} })

describe('isCronAuthorized', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret'
    process.env.SCHEDULER_SECRET = 'sched-secret'
  })
  it('accepterar båda nycklarna', () => {
    expect(isCronAuthorized(req('Bearer cron-secret'))).toBe(true)
    expect(isCronAuthorized(req('Bearer sched-secret'))).toBe(true)
  })
  it('nekar saknad, fel och tom nyckel', () => {
    expect(isCronAuthorized(req())).toBe(false)
    expect(isCronAuthorized(req('Bearer nope'))).toBe(false)
    expect(isCronAuthorized(req('cron-secret'))).toBe(false)
  })
  it('nekar allt när inga nycklar är konfigurerade (inga "undefined"-matchningar)', () => {
    delete process.env.CRON_SECRET
    delete process.env.SCHEDULER_SECRET
    expect(isCronAuthorized(req('Bearer undefined'))).toBe(false)
  })
})
