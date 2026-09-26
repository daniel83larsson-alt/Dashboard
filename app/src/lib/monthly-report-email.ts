// "Din månad" email — same brand chrome as Veckans Recap and the other
// transactional emails (dark header bar, white card, footer) so it reads as
// one product, but its own content model since it summarizes a whole month
// across training/vikt/kost/vanor instead of one week.
import type { MonthlyReportRecord } from './monthly-report-generate'

function statBox(value: string, label: string, width = '33%') {
  return `<td style="padding:12px;background:#f4f4f2;border-radius:12px;text-align:center;" width="${width}">
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

export function renderMonthlyReportHtml({
  name,
  record,
  unsubscribeUrl,
}: {
  name: string
  record: MonthlyReportRecord
  unsubscribeUrl: string
}): string {
  const { data, kost, deficit, insights } = record

  const headlineHtml = insights
    ? `<p style="margin:0 0 20px;color:#1a1a1a;font-size:16px;font-weight:600;line-height:1.4;">${insights.headline}</p>`
    : ''

  const newRecordsHtml = data.newRecords.length
    ? `<div style="margin:0 0 16px;">
        <p style="margin:0 0 6px;color:#777;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">🏅 Nya rekord denna månad</p>
        ${data.newRecords.map(r => `<p style="margin:0 0 2px;color:#1a1a1a;font-size:14px;">${r.label} (${new Date(r.startDate).toLocaleDateString('sv-SE')}): ${r.records.join(', ')}</p>`).join('')}
      </div>`
    : ''

  const bestSessionHtml = data.bestSession
    ? `<div style="margin:0 0 16px;padding:12px 16px;background:#f4f4f2;border-radius:12px;">
        <p style="margin:0 0 2px;color:#777;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">Månadens bästa pass</p>
        <p style="margin:0;color:#1a1a1a;font-size:14px;">${data.bestSession.label}${data.bestSession.distanceKm > 0 ? `, ${data.bestSession.distanceKm} km` : ''}, ${data.bestSession.minutes} min</p>
      </div>`
    : ''

  const weightHtml = data.weight.startKg != null && data.weight.endKg != null
    ? `<div style="margin:0 0 16px;padding:12px 16px;background:#f4f4f2;border-radius:12px;">
        <p style="margin:0 0 2px;color:#777;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">Vikt</p>
        <p style="margin:0;color:#1a1a1a;font-size:14px;">${data.weight.startKg.toFixed(1)} kg → ${data.weight.endKg.toFixed(1)} kg (${data.weight.changeKg! >= 0 ? '+' : ''}${data.weight.changeKg} kg)</p>
      </div>`
    : ''

  const kostHtml = kost
    ? `<div style="margin:0 0 16px;padding:14px 16px;background:#f4f4f2;border-radius:12px;">
        <p style="margin:0 0 8px;color:#777;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">🍽️ Kost denna månad</p>
        <table width="100%" cellpadding="0" cellspacing="6">
          <tr>
            ${statBox(kost.avgKcal != null ? String(Math.round(kost.avgKcal)) : '–', kost.kcalGoal != null ? `kcal/dag (mål ${Math.round(kost.kcalGoal)})` : 'kcal/dag')}
            ${statBox(`${kost.daysWithData}/${kost.totalDaysInMonth}`, 'dagar loggade')}
            ${statBox(kost.avgProteinG != null ? `${Math.round(kost.avgProteinG)}g` : '–', 'protein/dag')}
          </tr>
        </table>
        ${deficit ? `<p style="margin:10px 0 0;color:#1a1a1a;font-size:13px;">Viktmål: snitt ${deficit.avgDiffKcal > 0 ? '+' : ''}${deficit.avgDiffKcal} kcal/dag mot budgeten (${deficit.budgetKcal} kcal)</p>` : ''}
        ${insights?.nutrition ? `<p style="margin:10px 0 0;color:#1a1a1a;line-height:1.5;font-size:13.5px;">${insights.nutrition}</p>` : ''}
      </div>`
    : ''

  const habitsHtml = data.habits.length
    ? `<div style="margin:0 0 16px;padding:14px 16px;background:#f4f4f2;border-radius:12px;">
        <p style="margin:0 0 8px;color:#777;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">✅ Vanor</p>
        ${data.habits.map(h => `<p style="margin:0 0 2px;color:#1a1a1a;font-size:14px;">${h.title}: ${h.doneDays} dagar</p>`).join('')}
        ${insights?.habits ? `<p style="margin:8px 0 0;color:#1a1a1a;line-height:1.5;font-size:13.5px;">${insights.habits}</p>` : ''}
      </div>`
    : ''

  const insightsHtml = insights
    ? insightBlock('Träningsmånaden', insights.training) + insightBlock('Sömn & steg', insights.wellnessAndSleep)
    : `<p style="margin:0 0 16px;color:#999;font-size:13px;font-style:italic;">Kunde inte skriva insikter just nu — siffrorna nedan stämmer ändå.</p>`

  const funFactHtml = insights
    ? `<div style="margin:0 0 16px;padding:14px 16px;background:#0e1113;border-radius:12px;">
        <p style="margin:0 0 4px;color:#ccd400;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">✨ Kul fakta</p>
        <p style="margin:0;color:#fff;font-size:14px;line-height:1.5;">${insights.funFact}</p>
      </div>`
    : ''

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background:#f4f4f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#0e1113;padding:24px 32px;">
          <span style="color:#ccd400;font-size:22px;font-weight:700;">DL Trainer</span>
          <span style="color:#999;font-size:13px;margin-left:8px;">Din månad</span>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 4px;color:#1a1a1a;font-size:15px;">Hej ${name}!</p>
          <p style="margin:0 0 16px;color:#999;font-size:12px;text-transform:capitalize;">${data.monthLabel}</p>
          ${headlineHtml}
          <table width="100%" cellpadding="0" cellspacing="8" style="margin:0 0 8px;">
            <tr>
              ${statBox(String(data.thisMonth.sessions.count), 'pass')}
              ${statBox(`${data.thisMonth.sessions.totalKm} km`, 'distans')}
              ${statBox(data.thisMonth.wellness.avgSteps ? Math.round(data.thisMonth.wellness.avgSteps).toLocaleString('sv-SE') : '–', 'steg/dag')}
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="8" style="margin:0 0 18px;">
            <tr>
              ${statBox(data.thisMonth.wellness.avgSleepHours != null ? `${data.thisMonth.wellness.avgSleepHours.toFixed(1)}h` : '–', 'sömn/natt', '50%')}
              ${statBox(data.thisMonth.wellness.avgRestingHR != null ? String(Math.round(data.thisMonth.wellness.avgRestingHR)) : '–', 'vilopuls', '50%')}
            </tr>
          </table>
          ${weightHtml}
          ${bestSessionHtml}
          ${newRecordsHtml}
          ${insightsHtml}
          ${kostHtml}
          ${habitsHtml}
          ${funFactHtml}
          <p style="margin:24px 0 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="display:inline-block;background:#ccd400;color:#0e1113;padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">Öppna DL Trainer</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #eee;">
          <p style="margin:0;color:#999;font-size:11px;">
            Vill du inte längre få Din månad? <a href="${unsubscribeUrl}" style="color:#999;">Avsluta prenumeration</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function sendMonthlyReportEmail({
  userId,
  toEmail,
  name,
  record,
  subjectPrefix = '',
}: {
  userId: string
  toEmail: string
  name: string
  record: MonthlyReportRecord
  subjectPrefix?: string
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false
  // Own dedicated unsubscribe route/column (monthly_report_opt_out) — never
  // reuses Veckans Recap's, which would silently opt someone out of the
  // wrong email and say the wrong product name on its confirmation page.
  const html = renderMonthlyReportHtml({
    name,
    record,
    unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/monthly-report/unsubscribe?uid=${userId}`,
  })
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.NEWSLETTER_FROM_EMAIL ?? 'DL Trainer <onboarding@resend.dev>',
      to: toEmail,
      subject: `${subjectPrefix}Din månad: ${record.data.monthLabel}`,
      html,
    }),
  })
  return res.ok
}
