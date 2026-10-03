import Link from 'next/link'

// Ported from poc/dltrainer-landing.html (Daniel approved the mockup 2026-08-10).
// Illustrative numbers only — no real user data, same call Daniel made for the POC.

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  )
}

// Rounded pill CTA with the nested "button-in-button" arrow — the detail
// Daniel pointed at from the high-end design comparison specifically.
function PrimaryCta({ href, children, size = 'md' }: { href: string; children: React.ReactNode; size?: 'sm' | 'md' }) {
  const pad = size === 'sm' ? 'pl-4 pr-1.5 py-1.5 gap-2 text-sm' : 'pl-6 pr-2 py-2 gap-3 text-[15px]'
  const isle = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9'
  return (
    <Link href={href} className={`inline-flex items-center whitespace-nowrap bg-accent text-bg font-semibold rounded-full hover:opacity-90 transition-opacity group ${pad}`}>
      {children}
      <span className={`rounded-full bg-bg/15 flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${isle}`}>
        <ArrowIcon />
      </span>
    </Link>
  )
}

// ── Små "app-skärmar" som visar vad appen faktiskt gör. Exempeldata, ingen riktig användare.
function Screen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-edge rounded-[20px] p-5 shadow-2xl" role="img" aria-label={`Exempel: ${title}`}>
      <div className="text-[11px] text-muted mb-4">{title}</div>
      {children}
    </div>
  )
}

function TodayScreen() {
  return (
    <Screen title="Idag · exempel">
      <div className="grid grid-cols-3 gap-2.5 mb-2.5" aria-hidden="true">
        {[['🔥 12', 'Dagar i rad'], ['58', 'Vilopuls, bpm'], ['7.6 h', 'Sömn']].map(([v, l]) => (
          <div key={l} className="bg-bg border border-edge/60 rounded-xl p-3">
            <div className="font-mono font-bold text-lcd text-xl leading-none">{v}</div>
            <div className="text-muted text-[10.5px] mt-1.5">{l}</div>
          </div>
        ))}
      </div>
      <div className="bg-bg border border-edge/60 rounded-xl p-3.5" aria-hidden="true">
        <div className="flex items-baseline justify-between mb-2.5"><span className="text-[12px] text-muted">Veckans pass</span><span className="font-mono font-bold text-[15px]">4 av 5</span></div>
        <div className="flex gap-1">{[1, 2, 3, 4, 5].map(i => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= 4 ? 'bg-accent' : 'bg-edge/60'}`} />)}</div>
      </div>
      <div className="bg-bg border border-edge/60 rounded-xl p-3.5 mt-2.5 text-[13px] leading-relaxed" aria-hidden="true">
        <span className="text-muted">Coachen:</span> Bra vecka. Tisdagens intervaller satt, och sömnen har hållit sig över 7 timmar. Håll fredagen lugn.
      </div>
      <div className="flex gap-2 mt-3 flex-wrap" aria-hidden="true">
        <span className="font-mono text-[10.5px] text-muted bg-bg border border-edge/60 rounded-full px-2.5 py-1.5">🏅 Nytt rekord: 10 km</span>
        <span className="font-mono text-[10.5px] text-muted bg-bg border border-edge/60 rounded-full px-2.5 py-1.5">👍 2 vänner hejar på</span>
      </div>
    </Screen>
  )
}

function CoachScreen() {
  return (
    <Screen title="Pulscoachen · exempel">
      <div className="flex flex-col gap-2.5 text-[13px] leading-relaxed" aria-hidden="true">
        <div className="self-end max-w-[85%] bg-accent text-bg rounded-2xl rounded-br-sm px-3.5 py-2.5">Jag kör nästan allt i zon 2 — ligger jag rätt med mina zoner?</div>
        <div className="self-start max-w-[92%] bg-bg border border-edge rounded-2xl rounded-bl-sm px-3.5 py-2.5">
          Dina senaste fem lugna pass snittar <span className="font-mono text-lcd">134 bpm</span>, över din zon 2 (120–130). Antingen går du lite för hårt, eller så ligger zonen för lågt. Ett 30-minuterstest på jämn nivå ger svar — vill du ha upplägget?
        </div>
        <div className="self-start flex gap-2 flex-wrap">
          <span className="font-mono text-[11px] border border-edge rounded-full px-3 py-1.5 text-muted">Ja, ge mig testet</span>
          <span className="font-mono text-[11px] border border-edge rounded-full px-3 py-1.5 text-muted">Behåll zonerna</span>
        </div>
      </div>
    </Screen>
  )
}

function RecapScreen() {
  const zones = [
    { z: 'Z1', pct: 18, c: 'bg-lcd/50' },
    { z: 'Z2', pct: 62, c: 'bg-lcd' },
    { z: 'Z3', pct: 8, c: 'bg-habit/70' },
    { z: 'Z4', pct: 10, c: 'bg-accent' },
    { z: 'Z5', pct: 2, c: 'bg-red-400' },
  ]
  return (
    <Screen title="Veckans recap · exempel">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold">5 pass · 6 h 10 min</span>
        <span className="font-mono text-[11px] text-lcd">träningseffekt 3.4</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mt-4" aria-hidden="true">
        {zones.map(x => <div key={x.z} className={x.c} style={{ width: `${x.pct}%` }} />)}
      </div>
      <div className="flex justify-between font-mono text-[10.5px] text-muted mt-2" aria-hidden="true">
        {zones.map(x => <span key={x.z}>{x.z} {x.pct}%</span>)}
      </div>
      <p className="text-muted text-[13px] leading-relaxed mt-4">Ungefär 80/20: mest lugn bas och ett par hårda intervaller. Det är ett polariserat upplägg — du är på rätt spår.</p>
    </Screen>
  )
}

function FoodScreen() {
  return (
    <Screen title="Snabbval · exempel">
      <div className="flex flex-col gap-2" aria-hidden="true">
        {[['Havregröt med bär', '320 kcal · 14 g protein'], ['Kvarg & nötter', '280 kcal · 30 g protein']].map(([n, m]) => (
          <div key={n} className="flex items-center justify-between bg-bg border border-edge rounded-xl px-3.5 py-2.5 text-[13px]">
            <span>{n}</span><span className="font-mono text-[11px] text-muted">{m}</span>
          </div>
        ))}
        <div className="bg-bg border border-accent/40 rounded-xl p-3.5 mt-1">
          <div className="text-[13px] font-medium mb-2.5">Proteinshake</div>
          <div className="grid grid-cols-3 gap-2 text-[11px] text-muted">
            <div>Kcal<div className="mt-1 border border-edge rounded-lg px-2.5 py-1.5 text-fg font-mono">240</div></div>
            <div>Protein<div className="mt-1 border border-edge rounded-lg px-2.5 py-1.5 text-fg font-mono">35 g</div></div>
            <div>Portioner<div className="mt-1 border border-edge rounded-lg px-2.5 py-1.5 text-fg font-mono">1</div></div>
          </div>
          <div className="flex gap-2 mt-3 text-[12px]">
            <span className="bg-accent text-bg font-semibold rounded-lg px-3 py-1.5">Logga</span>
            <span className="border border-accent/40 text-accent rounded-lg px-3 py-1.5">Uppdatera rätten</span>
          </div>
        </div>
      </div>
    </Screen>
  )
}

function BudgetScreen() {
  return (
    <Screen title="Viktmål · exempel">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-bg border border-edge/60 rounded-xl p-3.5">
          <div className="font-mono font-bold text-lcd text-xl leading-none">2 150</div>
          <div className="text-muted text-[11px] mt-1.5">kcal / dag i budget</div>
        </div>
        <div className="bg-bg border border-edge/60 rounded-xl p-3.5">
          <div className="font-mono font-bold text-lcd text-xl leading-none">−0,4 kg</div>
          <div className="text-muted text-[11px] mt-1.5">senaste veckan</div>
        </div>
      </div>
      <div className="mt-4 text-[11px] text-muted flex justify-between"><span>Loggat denna vecka</span><span className="font-mono text-fg">6 av 6 dagar</span></div>
      <div className="h-1.5 bg-edge/60 rounded-full overflow-hidden mt-2"><div className="h-full bg-accent rounded-full" style={{ width: '100%' }} /></div>
      <p className="text-muted text-[13px] leading-relaxed mt-4">Budgeten räknas om varje vecka utifrån hur det faktiskt går — och dagar du inte hunnit logga än räknas aldrig som missade.</p>
    </Screen>
  )
}

function Showcase({ id, title, children, screen, flip }: { id?: string; title: string; children: React.ReactNode; screen: React.ReactNode; flip?: boolean }) {
  return (
    <div id={id} className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
      <div className={flip ? 'lg:order-2' : ''}>
        <h3 className="text-[1.5rem] sm:text-[1.8rem] font-bold leading-tight text-balance">{title}</h3>
        <div className="text-muted text-[15.5px] leading-relaxed mt-4 max-w-[52ch] flex flex-col gap-3">{children}</div>
      </div>
      <div className={flip ? 'lg:order-1' : ''}>{screen}</div>
    </div>
  )
}

export const FAQ: { q: string; a: string }[] = [
  { q: 'Vilka klockor och appar funkar med DL Trainer?', a: 'Garmin, Concept2, Strava, Polar och YAZIO kan kopplas in. Dina pass, din sömn och din mat synkas automatiskt, så du slipper föra in något för hand.' },
  { q: 'Vad kostar det?', a: 'Det är gratis att komma igång, du behöver inget kreditkort och det finns ingen bindningstid.' },
  { q: 'Vad gör AI-coacherna?', a: 'Det finns nio coacher, en per område, till exempel uthållighet, styrka, rörlighet, återhämtning och nutrition. De har tillgång till din egen träning, sömn och mat och svarar utifrån dem, inte med allmänna råd.' },
  { q: 'Kan coachen säga om mina pulszoner stämmer?', a: 'Ja. Frågar du om din puls jämför coachen dina senaste pass med dina zoner och kan föreslå ett test om det ser ut som att zonerna ligger fel. Du bestämmer själv om du ändrar något.' },
]

export default function LandingPage() {
  return (
    <div className="min-h-full">
      {/* Flytande topbar — position:fixed, inte sticky: globals.css sätter overflow-x:hidden på <body>
          (skydd mot en mobil Safari-bugg), vilket får sticky att tappa sin position vid skroll. */}
      <div className="fixed inset-x-0 top-4 z-40 flex justify-center px-4">
        <header className="w-full max-w-6xl flex items-center justify-between gap-4 bg-card/90 backdrop-blur border border-edge rounded-full pl-5 pr-2 py-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-accent text-bg flex items-center justify-center font-mono font-extrabold text-sm" aria-hidden="true">DL</div>
            <span className="font-semibold text-[15px]">DL <span className="text-accent">Trainer</span></span>
          </div>
          <nav aria-label="Sidans avsnitt" className="hidden sm:flex items-center gap-7 text-sm text-muted">
            <a href="#funktioner" className="hover:text-fg transition-colors">Funktioner</a>
            <a href="#sa-funkar-det" className="hover:text-fg transition-colors">Så funkar det</a>
            <a href="#fragor" className="hover:text-fg transition-colors">Frågor</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="font-mono text-[13px] whitespace-nowrap border border-edge rounded-full px-4 py-2 hover:border-accent hover:text-accent transition-colors">
              Logga in
            </Link>
            <PrimaryCta href="/login?mode=signup" size="sm">Skapa konto</PrimaryCta>
          </div>
        </header>
      </div>
      <div className="h-[72px]" aria-hidden="true" />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            style={{ background: 'radial-gradient(ellipse 900px 500px at 15% -10%, rgba(204,212,0,.10), transparent 60%), radial-gradient(ellipse 700px 500px at 100% 5%, rgba(167,189,169,.06), transparent 55%)' }}
          />
          <div className="max-w-6xl mx-auto px-6 pt-14 pb-16 grid lg:grid-cols-[1.05fr_.95fr] gap-12 items-center">
            <div>
              <h1 className="text-[2.3rem] sm:text-[3rem] font-bold leading-[1.08] tracking-tight text-balance">
                Träningen, maten och sömnen i samma app — med en coach som läser av allt.
              </h1>
              <p className="text-muted text-[17px] leading-relaxed mt-5 max-w-[48ch]">
                DL Trainer samlar pass, puls, sömn och kalorier från din klocka och dina appar. Coachen ser hur din vecka faktiskt ser ut och säger vad det betyder: är zonerna rätt, hänger du med i planen, räcker maten.
              </p>
              <div className="flex items-center gap-3.5 mt-8 flex-wrap">
                <PrimaryCta href="/login?mode=signup">Skapa konto — gratis att börja</PrimaryCta>
                <Link href="/login" className="border border-edge rounded-full px-5.5 py-3.5 text-[15px] font-semibold whitespace-nowrap hover:border-lcd-dim transition-colors">
                  Logga in
                </Link>
              </div>
              <p className="text-muted text-xs mt-3.5">
                <span className="text-fg font-medium">Ingen bindningstid.</span> Koppla Garmin, Concept2, Strava, Polar eller YAZIO på under en minut.
              </p>
            </div>
            <TodayScreen />
          </div>
        </section>

        {/* Kopplas till */}
        <section aria-label="Kopplar till" className="border-y border-edge/60">
          <div className="max-w-6xl mx-auto px-6 py-6 flex flex-wrap items-center gap-x-8 gap-y-3 text-muted">
            <span className="text-[13px]">Synkar med</span>
            {['Garmin', 'Concept2', 'Strava', 'Polar', 'YAZIO'].map(w => (
              <span key={w} className="font-mono text-[14px] text-fg">{w}</span>
            ))}
          </div>
        </section>

        {/* Funktioner */}
        <section id="funktioner" className="max-w-6xl mx-auto px-6 py-20 flex flex-col gap-24">
          <div className="max-w-[60ch]">
            <h2 className="text-[1.8rem] sm:text-[2.2rem] font-bold text-balance">Det du annars letar efter i fem olika appar</h2>
            <p className="text-muted text-[15.5px] leading-relaxed mt-3.5">Allt hänger ihop på riktigt: maten påverkar budgeten, passen påverkar planen och coachen känner till båda.</p>
          </div>

          <Showcase title="En coach som svarar utifrån dina egna siffror" screen={<CoachScreen />}>
            <p>Nio coacher, en per område, från uthållighet och styrka till återhämtning och nutrition. De har dina pass, din sömn och din mat framför sig när du frågar.</p>
            <p>Kör du mycket lugnt kan coachen kontrollera att dina pulszoner stämmer med hur du faktiskt tränar, och föreslå ett test om något ser fel ut.</p>
          </Showcase>

          <Showcase title="Veckan i ett ögonkast, med zoner och träningseffekt" screen={<RecapScreen />} flip>
            <p>Varje vecka och månad får du en recap med hur tiden fördelades över pulszonerna och om du ligger nära 80/20 eller någon annanstans.</p>
            <p>Pass utan träningseffekt från klockan får en uppskattad, så alla pass kan jämföras, även om din klocka inte räknar fram den.</p>
          </Showcase>

          <Showcase title="Logga mat utan att det blir ett jobb" screen={<FoodScreen />}>
            <p>Fota, sök, skriv eller välj ett snabbval. Dina vanliga rätter sparas med kalorier och protein, och du justerar dem direkt i rutan, en gång, så blir de rätt för alltid.</p>
            <p>Använder du YAZIO synkas maten automatiskt.</p>
          </Showcase>

          <Showcase title="En kaloribudget som följer verkligheten" screen={<BudgetScreen />} flip>
            <p>Sätt en målvikt och ett datum så räknar appen ut din dagliga budget och ditt proteinmål, och justerar dem varje vecka utifrån hur det faktiskt går.</p>
            <p>Veckoplanen räknar också om sig när du missar ett pass istället för att låtsas som ingenting.</p>
          </Showcase>

          <div>
            <h3 className="text-[1.3rem] font-bold">Och dessutom</h3>
            <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-6 mt-6 text-[14px]">
              {[
                ['Hälsa och VO2max', 'Sömn, vilopuls, HRV och en åldersnormerad VO2max-skala.'],
                ['Rekord', 'Personbästa uppdateras automatiskt efter varje pass.'],
                ['Vänner', 'Se vännernas pass och heja med en tumme upp.'],
                ['Vanor och milstolpar', 'Bygg streaks på vanor som stretching och få en eloge vid milstolpar.'],
                ['Rutter', 'Se var du sprungit eller cyklat, på karta.'],
                ['Fråga din egen Claude', 'Koppla din Claude till din träningsdata med en personlig nyckel.'],
              ].map(([t, d]) => (
                <div key={t} className="border-t border-edge pt-3">
                  <dt className="font-semibold">{t}</dt>
                  <dd className="text-muted mt-1 leading-relaxed">{d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Så funkar det */}
        <section id="sa-funkar-det" className="max-w-6xl mx-auto px-6 pb-20">
          <h2 className="text-[1.8rem] sm:text-[2.2rem] font-bold text-balance max-w-[28ch]">Igång på några minuter</h2>
          <ol className="grid sm:grid-cols-3 gap-4 mt-8 list-none">
            {[
              ['Koppla din klocka', 'Garmin, Concept2, Strava, Polar eller YAZIO. Pass, mat och hälsodata börjar synka direkt.'],
              ['Sätt ett mål', 'Ett lopp, ett antal pass i veckan eller bara "må bättre". Planen utgår från det du vill.'],
              ['Följ planen', 'Veckoplanen justerar sig efter hur veckan går, och coachen finns där mellan passen.'],
            ].map(([t, d], i) => (
              <li key={t} className="bg-card border border-edge rounded-2xl p-6">
                <span className="font-mono text-xs text-lcd">Steg {i + 1}</span>
                <h3 className="font-semibold text-[16.5px] mt-2">{t}</h3>
                <p className="text-muted text-[13.5px] leading-relaxed mt-2">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* FAQ */}
        <section id="fragor" className="max-w-3xl mx-auto px-6 pb-20">
          <h2 className="text-[1.8rem] sm:text-[2.2rem] font-bold">Vanliga frågor</h2>
          <div className="mt-6 divide-y divide-edge border-y border-edge">
            {FAQ.map(f => (
              <details key={f.q} className="group py-4">
                <summary className="cursor-pointer list-none flex items-center justify-between gap-4 font-semibold text-[15.5px] focus-visible:outline-2 focus-visible:outline-accent">
                  {f.q}
                  <span className="text-accent font-mono transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className="text-muted text-[14.5px] leading-relaxed mt-3 max-w-[60ch]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Avslutande CTA */}
        <section className="max-w-6xl mx-auto px-6 pb-24">
          <div className="relative overflow-hidden rounded-[26px] border border-edge bg-card p-10 sm:p-14 text-center">
            <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(204,212,0,.12), transparent 60%)' }} />
            <h2 className="relative text-[1.7rem] sm:text-[2.1rem] font-bold text-balance">Redo att se hela bilden av din träning?</h2>
            <p className="relative text-muted text-[15px] mt-3">Gratis att komma igång. Inget kreditkort krävs, ingen bindningstid.</p>
            <div className="relative flex items-center justify-center gap-3.5 mt-7 flex-wrap">
              <PrimaryCta href="/login?mode=signup">Skapa konto</PrimaryCta>
              <Link href="/login" className="border border-edge rounded-full px-5.5 py-3.5 text-[15px] font-semibold whitespace-nowrap hover:border-lcd-dim transition-colors">
                Logga in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-edge/60">
        <div className="max-w-6xl mx-auto px-6 py-7 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-muted text-[13px]">DL Trainer — din personliga AI-träningsdashboard</div>
          <nav aria-label="Sidfot" className="flex gap-5 text-[13px] text-muted">
            <a href="#funktioner" className="hover:text-fg transition-colors">Funktioner</a>
            <a href="#fragor" className="hover:text-fg transition-colors">Frågor</a>
            <Link href="/login" className="hover:text-fg transition-colors">Logga in</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
