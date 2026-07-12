import { NextRequest, NextResponse } from 'next/server'

// Temporary, one-time verification route for the new Sentry wiring — throws
// deliberately so we can confirm a real production error actually reaches
// Sentry before trusting the setup. Deleted again right after verifying.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  throw new Error('SENTRY_WIRING_TEST — deliberate test error, safe to ignore/resolve')
}
