// "Vad är nytt i DL Trainer" — kampanjmejl med riktiga skärmdumpar av appen,
// separat mall från den vanliga fria-text-nyhetsbrevet (renderNewsletterHtml)
// eftersom den här har en helt annan struktur (hero + rutnät av bildkort, inte
// fritext). Bilderna i public/marketing/ är beskurna till bara det starkaste
// kortet per sida och inramade (rundade hörn + mjuk skugga inbränt i själva
// PNG:n via PIL) eftersom box-shadow inte är pålitligt i e-postklienter.
// Nås via en publik URL — e-postklienter kan inte visa lokala filer eller
// (pålitligt) base64, bilder måste vara hostade.

type Feature = { image: string; title: string; body: string }

// Ledande funktion — den nya veckoplaneraren — får en egen, större
// hjälte-sektion istället för att stå i ledet med de andra.
const HERO: Feature = {
  image: 'veckoplan.png',
  title: 'Din tränare planerar veckan åt dig',
  body: 'Sätt ett mål tillsammans med AI-coachen, så får du "kör dessa denna veckan" istället för ett stelt schema månader framåt. Bocka av passen du kör — så ser du svart på vitt hur väl du följer planen, vecka för vecka.',
}

const GRID: Feature[] = [
  {
    image: 'oversikt.png',
    title: 'Allt på ett ställe',
    body: 'Streak och veckobelastning mot ditt mål, sammanfattat varje gång du öppnar appen.',
  },
  {
    image: 'halsa.png',
    title: 'Se din form utvecklas',
    body: 'VO2max, vilopuls, sömn och HRV — alltid märkt med källa, aldrig gissningar.',
  },
  {
    image: 'mat.png',
    title: 'Logga mat på tre sekunder',
    body: 'Sök, fota eller välj bland dina vanligaste — se direkt ätit mot bränt.',
  },
  {
    image: 'rutter.png',
    title: 'Hitta nya vägar',
    body: 'Löp-, cykel- och vandringsleder var du än befinner dig, helt gratis.',
  },
  {
    image: 'rekord.png',
    title: 'Dina personbästa',
    body: 'Snabbaste 1/3/5/10 km, längsta pass, längsta streak — per sport.',
  },
]

function heroHtml(f: Feature, appUrl: string): string {
  return `
  <tr><td style="padding:0 32px 8px;">
    <p style="margin:0 0 8px;color:#8a9a00;font-size:11px;font-weight:700;letter-spacing:0.08em;">🆕&nbsp;&nbsp;NYTT I APPEN</p>
    <p style="margin:0 0 10px;color:#0e1113;font-size:22px;font-weight:800;line-height:1.25;">${f.title}</p>
    <p style="margin:0 0 20px;color:#4a4f52;font-size:14px;line-height:1.6;">${f.body}</p>
  </td></tr>
  <tr><td style="padding:0 32px 32px;" align="center">
    <img src="${appUrl}/marketing/${f.image}" width="360" alt="${f.title}"
         style="display:block;width:360px;max-width:100%;height:auto;" />
  </td></tr>`
}

function gridCellHtml(f: Feature | null, appUrl: string): string {
  if (!f) return '<td width="50%" style="padding:0 8px;"></td>'
  return `
  <td width="50%" valign="top" style="padding:0 8px 24px;">
    <img src="${appUrl}/marketing/${f.image}" width="192" alt="${f.title}"
         style="display:block;width:100%;max-width:192px;height:auto;margin:0 0 12px;" />
    <p style="margin:0 0 4px;color:#0e1113;font-size:14px;font-weight:700;">${f.title}</p>
    <p style="margin:0;color:#4a4f52;font-size:12.5px;line-height:1.5;">${f.body}</p>
  </td>`
}

function gridRowsHtml(items: Feature[], appUrl: string): string {
  const rows: string[] = []
  for (let i = 0; i < items.length; i += 2) {
    const a = items[i]
    const b = items[i + 1] ?? null
    rows.push(`<tr>${gridCellHtml(a, appUrl)}${gridCellHtml(b, appUrl)}</tr>`)
  }
  return `
  <tr><td style="padding:8px 24px 0;">
    <table width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>
  </td></tr>`
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

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#e8e8e5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;">

        <tr><td style="background:#0e1113;padding:36px 32px 30px;">
          <span style="color:#ccd400;font-size:24px;font-weight:800;letter-spacing:-0.02em;">DL Trainer</span>
          <p style="margin:14px 0 0;color:#c9cccd;font-size:15px;line-height:1.55;">
            Hej ${name}! Det har hänt en hel del i appen sedan du var inne senast — här är en snabb rundtur på det bästa.
          </p>
        </td></tr>

        <tr><td style="height:32px;"></td></tr>

        ${heroHtml(HERO, appUrl)}

        <tr><td style="padding:0 32px;"><div style="border-top:1px solid #eee;"></div></td></tr>
        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0;color:#9a9d9f;font-size:11px;font-weight:700;letter-spacing:0.08em;">OCH MER</p>
        </td></tr>

        ${gridRowsHtml(GRID, appUrl)}

        <tr><td style="padding:16px 32px 8px;" align="center">
          <a href="${appUrl}/dashboard" style="display:inline-block;background:#ccd400;color:#0e1113;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">
            Logga in och se vad som är nytt
          </a>
        </td></tr>

        <tr><td style="padding:20px 32px 4px;" align="center">
          <p style="margin:0;color:#ccd400;font-size:12px;font-weight:600;letter-spacing:0.02em;">
            🌐 Vi håller på att flytta in på vår egen adress — dltrainer.se
          </p>
        </td></tr>

        ${wrongVersionNote ? `
        <tr><td style="padding:12px 32px 4px;">
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
