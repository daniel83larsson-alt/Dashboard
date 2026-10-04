// Gemensam behörighetskontroll för cron-rutter. Två giltiga nycklar:
// CRON_SECRET (manuell körning / GitHub Actions workflow_dispatch) och
// SCHEDULER_SECRET (Supabase pg_cron, se call_scheduled_cron_route[_long]).
export function isCronAuthorized(request: Request): boolean {
  const header = request.headers.get('authorization')
  const cron = process.env.CRON_SECRET
  const scheduler = process.env.SCHEDULER_SECRET
  return (!!cron && header === `Bearer ${cron}`) || (!!scheduler && header === `Bearer ${scheduler}`)
}
