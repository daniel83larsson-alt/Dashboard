// "Vad är nytt i DL Trainer" — kampanjmejl med riktiga skärmdumpar av appen,
// separat mall från den vanliga fria-text-nyhetsbrevet (renderNewsletterHtml)
// eftersom den här har en helt annan struktur (bildkort per funktion, inte
// fritext). Skärmdumparna ligger i public/marketing/ och nås via en publik
// URL — e-postklienter kan inte visa lokala filer eller (pålitligt) base64,
// bilder måste vara hostade.

type Feature = { image: string; title: string; body: string }

const FEATURES: Feature[] = [
  {
    image: 'veckoplan.png',
    title: '🆕 Din tränare planerar veckan åt dig',
    body: 'Sätt ett mål tillsammans med AI-coachen, så får du "kör dessa denna veckan" istället för ett stelt schema månader framåt. Bocka av passen du kör — så ser du svart på vitt hur väl du följer planen, vecka för vecka.',
  },
  {
    image: 'oversikt.png',
    title: 'Allt på ett ställe',
    body: 'Streak, veckobelastning mot ditt mål, senaste passet och en kalender över allt du tränat — sammanfattat varje gång du öppnar appen, ingen jakt efter siffror.',
  },
  {
    image: 'halsa.png',
    title: 'Se din form utvecklas',
    body: 'VO2max, vilopuls, sömn, HRV och Body Battery samlat på ett ställe — alltid tydligt märkt om värdet kommer från Garmin eller är ett eget estimat, aldrig gissningar utan källa.',
  },
  {
    image: 'mat.png',
    title: 'Logga mat på tre sekunder',
    body: 'Sök, fota en rätt eller välj bland dina vanligaste — se direkt hur det du ätit står mot vad du bränt idag. Ingen manuell kalorijakt.',
  },
  {
    image: 'rutter.png',
    title: 'Hitta nya vägar att springa',
    body: 'Sök löp-, cykel- och vandringsleder var du än befinner dig — gratis data från OpenStreetMap, ingen betallösning som stänger ute tredjepartsappar.',
  },
  {
    image: 'rekord.png',
    title: 'Dina personbästa, alltid uppdaterade',
    body: 'Snabbaste 1/3/5/10 km, längsta pass, längsta streak — per sport, uträknat automatiskt varje gång du loggar ett nytt pass.',
  },
]

function featureCardHtml(f: Feature, appUrl: string): string {
  return `
  <tr><td style="padding:0 32px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding-bottom:14px;">
        <img src="${appUrl}/marketing/${f.image}" width="220" alt="${f.title}"
             style="display:block;width:220px;max-width:100%;height:auto;border-radius:14px;border:1px solid #2a2e30;" />
      </td></tr>
      <tr><td>
        <p style="margin:0 0 6px;color:#0e1113;font-size:16px;font-weight:700;">${f.title}</p>
        <p style="margin:0;color:#4a4f52;font-size:14px;line-height:1.55;">${f.body}</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 32px;"><div style="border-top:1px solid #eee;"></div></td></tr>`
}

export function renderFeatureShowcaseHtml({
  name,
  wrongVersionNote,
  unsubscribeUrl,
}: {
  name: string
  wrongVersionNote: boolean
  unsubscribeUrl: string
}): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const featuresHtml = FEATURES.map(f => featureCardHtml(f, appUrl)).join('')

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f4f4f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">

        <tr><td style="background:#0e1113;padding:32px 32px 28px;">
          <span style="color:#ccd400;font-size:24px;font-weight:700;">DL Trainer</span>
          <p style="margin:12px 0 0;color:#c9cccd;font-size:15px;line-height:1.5;">
            Hej ${name}! Det har hänt en hel del i appen sedan du var inne senast — här är en snabb rundtur på det bästa.
          </p>
        </td></tr>

        <tr><td style="height:28px;"></td></tr>

        ${featuresHtml}

        <tr><td style="padding:28px 32px 8px;" align="center">
          <a href="${appUrl}/dashboard" style="display:inline-block;background:#ccd400;color:#0e1113;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">
            Logga in och se vad som är nytt
          </a>
        </td></tr>

        ${wrongVersionNote ? `
        <tr><td style="padding:20px 32px 4px;">
          <p style="margin:0;color:#999;font-size:12px;line-height:1.6;">
            PS: Om du (eller någon du tipsat om appen) registrerade sig nyligen och landade på en gammal testversion av sidan — det är åtgärdat nu. Logga in via knappen ovan så hamnar du garanterat på rätt ställe.
          </p>
        </td></tr>` : ''}

        <tr><td style="padding:24px 32px 20px;border-top:1px solid #eee;">
          <p style="margin:0;color:#999;font-size:11px;">
            Vill du inte längre få de här mejlen? <a href="${unsubscribeUrl}" style="color:#999;">Avsluta prenumeration</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
