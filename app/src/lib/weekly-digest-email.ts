// "Veckans Recap" email — reuses renderNewsletterHtml's chrome (dark header
// bar, white card, footer+unsubscribe) so the two emails read as one
// product, but NOT its content model: this has a full narrative + stats +
// adherence + look-ahead instead of one personalLine(), so it gets its own
// render function rather than overloading the newsletter one.
import type { WeeklyDigestRecord } from './weekly-digest-generate'

function fmtDateRange(startISO: string, endISO: string) {
  const start = new Date(`${startISO}T00:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
  const end = new Date(`${endISO}T00:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
  return `${start}–${end}`
}

function statBox(value: string, label: string) {
  return `<td style="padding:12px;background:#f4f4f2;border-radius:12px;text-align:center;" width="33%">
    <div style="color:#0e1113;font-size:18px;font-weight:700;font-family:monospace;">${value}</div>
    <div style="color:#777;font-size:11px;margin-top:2px;">${label}</div>
  </td>`
}

function insightBlock(label: string, text: string) {
  return `<div style="margin:0 0 14px;">
    <p style="margin:0 0 3px;color:#999;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">${label}</p>
    <p style="margin:0;color:#1a1a1a;line-height:1.55;font-size:14.5px;">${text}</p>
  </div>`
}

export function renderWeeklyDigestHtml({
  name,
  record,
  unsubscribeUrl,
}: {
  name: string
  record: WeeklyDigestRecord
  unsubscribeUrl: string
}): string {
  const { thisWeek, adherence, lookAhead } = record.data

  const adherenceHtml = adherence
    ? `<div style="margin:0 0 16px;padding:12px 16px;background:#f4f4f2;border-radius:12px;">
        <p style="margin:0;color:#1a1a1a;font-size:14px;">${adherence.label}</p>
      </div>`
    : ''

  const insightsHtml = record.insights
    ? insightBlock('Om veckans pass', record.insights.sessions)
      + insightBlock('Sömn & steg', record.insights.wellness)
    : `<p style="margin:0 0 16px;color:#999;font-size:13px;font-style:italic;">Kunde inte skriva insikter just nu — siffrorna nedan stämmer ändå.</p>`

  const motivationHtml = record.insights ? insightBlock('Inför nästa vecka', record.insights.motivation) : ''

  const lookAheadHtml = lookAhead.kind === 'plan'
    ? `<div style="margin:0 0 16px;">
        <p style="margin:0 0 6px;color:#777;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">Nästa veckas plan</p>
        <p style="margin:0;color:#1a1a1a;font-size:14px;">${lookAhead.sessions.filter(s => !s.isRest).map(s => s.label).join(', ') || 'Vila'}</p>
      </div>`
    : ''

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f4f4f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#0e1113;padding:24px 32px;">
          <span style="color:#ccd400;font-size:22px;font-weight:700;">DL Trainer</span>
          <span style="color:#999;font-size:13px;margin-left:8px;">Veckans Recap</span>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 4px;color:#1a1a1a;font-size:15px;">Hej ${name}!</p>
          <p style="margin:0 0 20px;color:#999;font-size:12px;">${fmtDateRange(record.weekStartISO, record.weekEndISO)}</p>
          <table width="100%" cellpadding="0" cellspacing="8" style="margin:0 0 18px;">
            <tr>
              ${statBox(String(thisWeek.sessions.count), 'pass')}
              ${statBox(`${thisWeek.sessions.totalKm} km`, 'distans')}
              ${statBox(thisWeek.wellness.avgSteps ? Math.round(thisWeek.wellness.avgSteps).toLocaleString('sv-SE') : '–', 'steg/dag')}
            </tr>
          </table>
          ${adherenceHtml}
          ${insightsHtml}
          ${motivationHtml}
          ${lookAheadHtml}
          <p style="margin:24px 0 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/veckoplan" style="display:inline-block;background:#ccd400;color:#0e1113;padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">Öppna Veckoplan</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #eee;">
          <p style="margin:0;color:#999;font-size:11px;">
            Vill du inte längre få Veckans Recap? <a href="${unsubscribeUrl}" style="color:#999;">Avsluta prenumeration</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function sendWeeklyDigestEmail({
  userId,
  toEmail,
  name,
  record,
  subjectPrefix = '',
}: {
  userId: string
  toEmail: string
  name: string
  record: WeeklyDigestRecord
  subjectPrefix?: string
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false
  const html = renderWeeklyDigestHtml({
    name,
    record,
    unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/weekly-digest/unsubscribe?uid=${userId}`,
  })
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.NEWSLETTER_FROM_EMAIL ?? 'DL Trainer <onboarding@resend.dev>',
      to: toEmail,
      subject: `${subjectPrefix}Veckans Recap: ${fmtDateRange(record.weekStartISO, record.weekEndISO)}`,
      html,
    }),
  })
  return res.ok
}
