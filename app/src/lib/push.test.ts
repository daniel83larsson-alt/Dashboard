import { describe, it, expect } from 'vitest'
import { summarizePush, type PushSendResult } from './push'

const ok = (sent = 1): PromiseFulfilledResult<PushSendResult> => ({ status: 'fulfilled', value: { sent, failed: 0, removed: 0, errors: [] } })
const failed = (status: number | null): PromiseFulfilledResult<PushSendResult> => ({
  status: 'fulfilled', value: { sent: 0, failed: 1, removed: 0, errors: [{ status, body: 'x' }] },
})
const none: PromiseFulfilledResult<PushSendResult> = { status: 'fulfilled', value: { sent: 0, failed: 0, removed: 0, errors: [] } }

describe('summarizePush', () => {
  it('räknar bara användare som faktiskt fick en push som levererade', () => {
    const r = summarizePush([ok(), ok(2), failed(403), none])
    expect(r).toMatchObject({ attempted: 4, delivered: 2, failedUsers: 1 })
  })
  it('sammanfattar felkoder så ett fel hos Apple syns i cron-svaret', () => {
    expect(summarizePush([failed(403), failed(403), failed(null)]).errorStatuses).toEqual({ '403': 2, unknown: 1 })
  })
  it('räknar avvisade löften som misslyckade', () => {
    const r = summarizePush([{ status: 'rejected', reason: new Error('VAPID keys not configured') }])
    expect(r).toMatchObject({ delivered: 0, failedUsers: 1, errorStatuses: { exception: 1 } })
  })
})
