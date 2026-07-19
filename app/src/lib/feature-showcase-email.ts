// "Vad är nytt i DL Trainer" — kampanjmejl med riktiga skärmdumpar av appen,
// separat mall från den vanliga fria-text-nyhetsbrevet (renderNewsletterHtml)
// eftersom den här har en helt annan struktur (hjälte + rutnät av bildkort,
// inte fritext). Design efter Daniels referens (apple.com/se/iphone-17):
// stora, djärva flerfärgade rubriker och skärmdumpar beskurna till att se ut
// som de "läcker" ur en telefon (rundade hörn i skärm-radie + en liten
// dynamic-island-pill inbränt ovanpå hjälte-bilden), inte platta skärmdumpar
// i en ruta. Multifärgad text är solida <span>-färger, inte
// background-clip-gradient — det senare renderar osynligt/svart i Gmails
// webbklient, en känd e-postfälla. Bilderna i public/marketing/ är
// beskurna+inramade med PIL eftersom box-shadow inte är pålitligt i
// e-postklienter. Nås via en publik URL — e-postklienter kan inte visa
// lokala filer eller (pålitligt) base64, bilder måste vara hostade.

type Feature = { image: string; eyebrow: string; title: string; body: string }

// Ledande funktion — den nya veckoplaneraren — får en egen, större
// hjälte-sektion med Apple-stil flerfärgad rubrik istället för att stå i
// ledet med de andra.
const HERO = {
  image: 'veckoplan.png',
  eyebrow: 'Veckoplan.',
  titleParts: [
    { text: 'Din tränare ', color: '#0e1113' },
    { text: 'planerar veckan', color: '#ccd400' },
    { text: ' åt dig.', color: '#0e1113' },
  ],
  body: 'Sätt ett mål tillsammans med AI-coachen, så får du "kör dessa denna veckan" istället för ett stelt schema månader framåt. Bocka av passen du kör — se svart på vitt hur väl du följer planen, vecka för vecka.',
}

const GRID: Feature[] = [
  {
    image: 'oversikt.png',
    eyebrow: 'Översikt.',
    title: 'Allt på ett ställe.',
    body: 'Streak och veckobelastning mot ditt mål, sammanfattat varje gång du öppnar appen.',
  },
  {
    image: 'vanner.png',
    eyebrow: 'Vänner.',
    title: 'Träna tillsammans, på distans.',
    body: 'Följ vänner, ge kudos på deras pass och se deras träning dyka upp i ditt eget flöde.',
  },
  {
    image: 'halsa.png',
    eyebrow: 'Hälsa.',
    title: 'Se din form utvecklas.',
    body: 'VO2max, vilopuls, sömn och HRV — alltid märkt med källa, aldrig gissningar.',
  },
  {
    image: 'mat.png',
    eyebrow: 'Mat.',
    title: 'Logga mat på tre sekunder.',
    body: 'Sök, fota eller välj bland dina vanligaste — se direkt ätit mot bränt.',
  },
  {
    image: 'rutter.png',
    eyebrow: 'Rutter.',
    title: 'Hitta nya vägar.',
    body: 'Löp-, cykel- och vandringsleder var du än befinner dig, helt gratis.',
  },
  {
    image: 'rekord.png',
    eyebrow: 'Rekord.',
    title: 'Dina personbästa.',
    body: 'Snabbaste 1/3/5/10 km, längsta pass, längsta streak — per sport.',
  },
]

function heroHtml(appUrl: string): string {
  const titleHtml = HERO.titleParts
    .map(p => `<span style="color:${p.color};">${p.text}</span>`)
    .join('')
  const titleText = HERO.titleParts.map(p => p.text).join('')
  return `
  <tr><td style="padding:0 32px 4px;">
    <p style="margin:0 0 6px;color:#8a9a00;font-size:12px;font-weight:700;letter-spacing:0.02em;">${HERO.eyebrow}</p>
    <p style="margin:0 0 16px;font-size:34px;font-weight:800;line-height:1.12;letter-spacing:-0.02em;">${titleHtml}</p>
    <p style="margin:0 0 24px;color:#4a4f52;font-size:15px;line-height:1.6;max-width:380px;">${HERO.body}</p>
  </td></tr>
  <tr><td style="padding:0 16px 36px;" align="center">
    <img src="${appUrl}/marketing/${HERO.image}" width="380" alt="${titleText}"
         style="display:block;width:380px;max-width:100%;height:auto;" />
  </td></tr>`
}

function gridCellHtml(f: Feature | null, appUrl: string): string {
  if (!f) return '<td width="50%" style="padding:0 8px;"></td>'
  return `
  <td width="50%" valign="top" style="padding:0 8px 28px;">
    <img src="${appUrl}/marketing/${f.image}" width="192" alt="${f.title}"
         style="display:block;width:100%;max-width:192px;height:auto;margin:0 0 14px;" />
    <p style="margin:0 0 3px;color:#8a9a00;font-size:10.5px;font-weight:700;letter-spacing:0.02em;">${f.eyebrow}</p>
    <p style="margin:0 0 4px;color:#0e1113;font-size:15px;font-weight:800;letter-spacing:-0.01em;">${f.title}</p>
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

        <tr><td style="height:36px;"></td></tr>

        ${heroHtml(appUrl)}

        <tr><td style="padding:0 32px;"><div style="border-top:1px solid #eee;"></div></td></tr>
        <tr><td style="padding:28px 32px 4px;">
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
            🌐 Nu på vår egen adress — dltrainer.se
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
