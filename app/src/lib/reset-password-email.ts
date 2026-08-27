// Password-reset email, sent by US via Resend instead of Supabase's own
// built-in mailer. Not a style choice — Supabase's free tier (no custom
// SMTP configured) blocks editing its auth email templates entirely
// ("Email template modification is not available for free tier projects"),
// so the default {{ .ConfirmationURL }} template — a link straight to
// Supabase's own single-use, plain-GET /verify endpoint — can't be changed.
// That endpoint is exactly what got a real user locked out: a mail
// prescanner (Gmail's own link-scanning, confirmed via the auth logs — a
// Google-owned IP hit /verify and burned the token 9 seconds before the
// user's own click) consumed the one-time token before it ever reached
// them. Generating the link ourselves (admin.generateLink, see
// api/auth/forgot-password/route.ts) and sending it through our own,
// already-working Resend pipeline sidesteps Supabase's mailer — and its
// template restriction — entirely. Same dark-header-card chrome as
// weekly-digest-email.ts so the three transactional emails read as one
// product; see email-templates.test.ts for the color-scheme regression
// test all three share.
export function renderResetPasswordHtml({ resetUrl }: { resetUrl: string }): string {
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
          <span style="color:#999;font-size:13px;margin-left:8px;">Återställ lösenord</span>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 16px;color:#1a1a1a;font-size:15px;line-height:1.5;">Vi fick en förfrågan om att återställa lösenordet för ditt DL Trainer-konto. Klicka på knappen nedan för att välja ett nytt.</p>
          <p style="margin:24px 0;">
            <a href="${resetUrl}" style="display:inline-block;background:#ccd400;color:#0e1113;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">Återställ lösenord</a>
          </p>
          <p style="margin:0;color:#999;font-size:12px;line-height:1.5;">Länken är giltig i 1 timme och kan bara användas en gång. Bad du inte om det här kan du ignorera mejlet — inget ändras förrän du klickar och väljer ett nytt lösenord.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function sendResetPasswordEmail({ toEmail, resetUrl }: { toEmail: string; resetUrl: string }): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.NEWSLETTER_FROM_EMAIL ?? 'DL Trainer <onboarding@resend.dev>',
      to: toEmail,
      subject: 'Återställ ditt DL Trainer-lösenord',
      html: renderResetPasswordHtml({ resetUrl }),
    }),
  })
  return res.ok
}
