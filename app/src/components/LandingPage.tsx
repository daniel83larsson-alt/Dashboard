import Link from 'next/link'

// Ported from poc/dltrainer-landing.html (Daniel approved the mockup 2026-08-10).
// Illustrative numbers only — no real user data, same call Daniel made for the POC.

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
      {children}
    </span>
  )
}

function FeatureCard({ icon, title, children, wide }: { icon: string; title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`bg-card border border-edge rounded-2xl p-5 flex flex-col gap-3 hover:border-accent/35 transition-colors ${wide ? 'sm:col-span-2' : ''}`}>
      <div className="w-10 h-10 rounded-xl bg-bg border border-edge flex items-center justify-center text-lg">{icon}</div>
      <h3 className="font-semibold text-[15px]">{title}</h3>
      <p className="text-muted text-[13.5px] leading-relaxed">{children}</p>
    </div>
  )
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-edge rounded-2xl p-6">
      <span className="font-mono text-xs text-lcd tracking-wider">{n}</span>
      <h3 className="font-semibold text-[16.5px] mt-3">{title}</h3>
      <p className="text-muted text-[13.5px] leading-relaxed mt-2.5">{children}</p>
    </div>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-full">
      {/* ── Topbar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-bg/85 backdrop-blur border-b border-edge/60">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent text-bg flex items-center justify-center font-mono font-extrabold text-sm">DL</div>
            <span className="font-semibold text-[15px]">DL <span className="text-accent">Trainer</span></span>
          </div>
          <nav className="hidden sm:flex items-center gap-7 text-sm text-muted">
            <a href="#funktioner" className="hover:text-fg transition-colors">Funktioner</a>
            <a href="#sa-funkar-det" className="hover:text-fg transition-colors">Så funkar det</a>
            <a href="#klockor" className="hover:text-fg transition-colors">Din klocka</a>
          </nav>
          <div className="flex items-center gap-2.5">
            <Link href="/login" className="font-mono text-[13px] border border-edge rounded-xl px-4 py-2 hover:border-accent hover:text-accent transition-colors">
              Logga in
            </Link>
            <Link href="/login?mode=signup" className="bg-accent text-bg font-semibold text-sm rounded-xl px-4 py-2 hover:opacity-90 transition-opacity">
              Skapa konto
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            style={{ background: 'radial-gradient(ellipse 900px 500px at 15% -10%, rgba(204,212,0,.10), transparent 60%), radial-gradient(ellipse 700px 500px at 100% 5%, rgba(167,189,169,.06), transparent 55%)' }}
          />
          <div className="max-w-6xl mx-auto px-6 pt-16 pb-10 grid lg:grid-cols-[1.05fr_.95fr] gap-12 items-center">
            <div>
              <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-lcd bg-lcd/10 border border-lcd/25 rounded-full px-3 py-1.5 mb-5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                Ett dashboard, alla sporter
              </span>
              <h1 className="text-[2.3rem] sm:text-[2.9rem] font-bold leading-[1.08] tracking-tight text-balance">
                Din tränare, <span className="text-accent">dygnet runt</span>. Inte bara siffror — någon som vet vad de betyder.
              </h1>
              <p className="text-muted text-[17px] leading-relaxed mt-5 max-w-[46ch]">
                DL Trainer samlar dina pass, din sömn, din mat och din puls på ett ställe. Varje sportgren har sin egen AI-coach, och planen anpassas efter din vecka — inte samma mall för alla.
              </p>
              <div className="flex items-center gap-3.5 mt-8 flex-wrap">
                <Link href="/login?mode=signup" className="bg-accent text-bg font-semibold text-[15px] rounded-xl px-6 py-3.5 hover:opacity-90 transition-opacity">
                  Skapa konto — gratis att börja
                </Link>
                <Link href="/login" className="border border-edge rounded-xl px-5.5 py-3.5 text-[15px] font-semibold hover:border-lcd-dim transition-colors">
                  Logga in
                </Link>
              </div>
              <p className="text-muted text-xs mt-3.5">
                <span className="text-fg font-medium">Ingen bindningstid</span> — koppla Garmin, Concept2, Strava eller Polar på under en minut.
              </p>
            </div>

            {/* Instrument mock */}
            <div className="bg-card border border-edge rounded-[22px] p-5 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] uppercase tracking-wider text-muted">Idag</span>
                <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-lcd">
                  <span className="w-1.5 h-1.5 rounded-full bg-lcd animate-pulse" />live
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2.5 mb-2.5">
                <div className="bg-bg border border-edge/60 rounded-xl p-3">
                  <div className="font-mono font-bold text-lcd text-xl leading-none">🔥 12</div>
                  <div className="text-muted text-[10px] mt-1.5 uppercase tracking-wide">Dagar i rad</div>
                </div>
                <div className="bg-bg border border-edge/60 rounded-xl p-3">
                  <div className="font-mono font-bold text-lcd text-xl leading-none">58<span className="text-[11px] text-lcd-dim font-normal"> bpm</span></div>
                  <div className="text-muted text-[10px] mt-1.5 uppercase tracking-wide">Vilopuls</div>
                </div>
                <div className="bg-bg border border-edge/60 rounded-xl p-3">
                  <div className="font-mono font-bold text-lcd text-xl leading-none">7.6<span className="text-[11px] text-lcd-dim font-normal">h</span></div>
                  <div className="text-muted text-[10px] mt-1.5 uppercase tracking-wide">Sömn</div>
                </div>
              </div>
              <div className="bg-bg border border-edge/60 rounded-xl p-3.5 mt-2.5">
                <div className="flex items-baseline justify-between mb-2.5">
                  <span className="text-[11px] uppercase tracking-wide text-muted">Veckobelastning</span>
                  <span className="font-mono font-bold text-[15px]">86%</span>
                </div>
                <div className="h-1.5 bg-edge/60 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-accent" style={{ width: '86%' }} />
                </div>
              </div>
              <div className="bg-bg border border-edge/60 rounded-xl p-3.5 mt-2.5">
                <div className="flex items-baseline justify-between mb-2.5">
                  <span className="text-[11px] uppercase tracking-wide text-muted">VO2max</span>
                  <span className="font-mono font-bold text-[15px]">47.2 <span className="text-muted font-normal text-[11px]">ml/kg/min</span></span>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= 4 ? 'bg-accent' : 'bg-edge/60'}`} />
                  ))}
                </div>
                <div className="font-mono text-[10.5px] text-muted mt-2"><span className="text-fg font-semibold">Bra</span> för din ålder och ditt kön</div>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                <span className="font-mono text-[10px] text-muted bg-bg border border-edge/60 rounded-full px-2.5 py-1.5">🏅 Nytt rekord: 10 km</span>
                <span className="font-mono text-[10px] text-muted bg-bg border border-edge/60 rounded-full px-2.5 py-1.5">👍 2 vänner hejar på</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats strip ──────────────────────────────────────────────── */}
        <section className="border-y border-edge/60">
          <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div><div className="font-mono font-bold text-accent text-3xl leading-none">9</div><div className="text-muted text-[13px] mt-2">AI-coacher, en per sportgren</div></div>
            <div><div className="font-mono font-bold text-accent text-3xl leading-none">4</div><div className="text-muted text-[13px] mt-2">Klockor &amp; appar som synkas direkt</div></div>
            <div><div className="font-mono font-bold text-accent text-3xl leading-none">24/7</div><div className="text-muted text-[13px] mt-2">Coachning tillgänglig dygnet runt</div></div>
            <div><div className="font-mono font-bold text-accent text-3xl leading-none">1</div><div className="text-muted text-[13px] mt-2">Dashboard för hela din träning</div></div>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────── */}
        <section id="funktioner" className="max-w-6xl mx-auto px-6 py-20">
          <div className="max-w-[60ch] mb-10">
            <Eyebrow>Funktioner</Eyebrow>
            <h2 className="text-[1.8rem] sm:text-[2.1rem] font-bold mt-3 text-balance">Allt som annars är utspritt i olika appar, samlat på ett ställe</h2>
            <p className="text-muted text-[15.5px] leading-relaxed mt-3.5">Du väljer vad du vill använda. Allt hänger ihop på riktigt, istället för separata appar som aldrig delar data med varandra.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard icon="🏋️" title="En AI-coach per sportgren" wide>
              Uthållighet, styrka, HIIT, rörlighet och mer — nio olika coacher, en per gren, som redan känner till din vecka innan du hinner fråga.
            </FeatureCard>
            <FeatureCard icon="💓" title="Hälsa & VO2max">
              Sömn, puls, HRV, Body Battery — och en åldersnormerad VO2max-skala som visar var du faktiskt ligger.
            </FeatureCard>
            <FeatureCard icon="🗓️" title="Veckoplan">
              AI-genererad plan som räknar om sig när du missar ett pass, istället för att strunta i det.
            </FeatureCard>
            <FeatureCard icon="🍽️" title="Mat & kalorier">
              Fota, sök eller snabbval — se vad du ätit mot vad du bränt, utan att räkna för hand.
            </FeatureCard>
            <FeatureCard icon="🏅" title="Rekord & pulszoner">
              Personbästa uppdateras automatiskt efter varje pass. Inga fler egna Excel-ark.
            </FeatureCard>
            <FeatureCard icon="👥" title="Community" wide>
              Se vännernas pass, heja med en tumme upp, håll koll på gemensamma streaks — träningen blir lättare att hålla igång när någon annan ser den.
            </FeatureCard>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <section id="sa-funkar-det" className="max-w-6xl mx-auto px-6 py-20">
          <div className="max-w-[60ch] mb-10">
            <Eyebrow>Så funkar det</Eyebrow>
            <h2 className="text-[1.8rem] sm:text-[2.1rem] font-bold mt-3 text-balance">Igång på tre minuter — inga krångliga inställningar i vägen</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <Step n="01 — ANSLUT" title="Koppla din klocka">
              Garmin, Concept2, Strava eller Polar — dina pass och din hälsodata börjar synka direkt, ingen manuell inmatning.
            </Step>
            <Step n="02 — BERÄTTA" title="Sätt ett mål">
              Ett lopp, ett antal pass i veckan, eller bara &quot;må bättre&quot; — tränarteamet planerar utifrån det du faktiskt vill.
            </Step>
            <Step n="03 — KÖR" title="Få en plan, dag för dag">
              Veckoplanen justerar sig efter hur veckan faktiskt går, och tränarteamet finns där för frågor mellan passen.
            </Step>
          </div>
        </section>

        {/* ── Watches ──────────────────────────────────────────────────── */}
        <section id="klockor" className="max-w-6xl mx-auto px-6 pb-16">
          <div className="max-w-[60ch] mb-6">
            <Eyebrow>Kopplat till din utrustning</Eyebrow>
            <h2 className="text-[1.8rem] sm:text-[2.1rem] font-bold mt-3 text-balance">Du har redan en klocka. Nu kopplar vi ihop den med resten av din träning.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            {['Garmin', 'Concept2 PM5', 'Strava', 'Polar'].map(w => (
              <span key={w} className="font-mono text-[13px] bg-card border border-edge rounded-full px-4 py-2.5 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-lcd" />{w}
              </span>
            ))}
          </div>
        </section>

        {/* ── Closing CTA ──────────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-6 pb-24">
          <div className="relative overflow-hidden rounded-[26px] border border-edge bg-card p-10 sm:p-14 text-center">
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(circle at 50% 0%, rgba(204,212,0,.12), transparent 60%)' }}
            />
            <h2 className="relative text-[1.7rem] sm:text-[2.1rem] font-bold text-balance">Redo att sätta igång på riktigt?</h2>
            <p className="relative text-muted text-[15px] mt-3">Gratis att komma igång. Inget kreditkort krävs, ingen bindningstid.</p>
            <div className="relative flex items-center justify-center gap-3.5 mt-7 flex-wrap">
              <Link href="/login?mode=signup" className="bg-accent text-bg font-semibold text-[15px] rounded-xl px-6 py-3.5 hover:opacity-90 transition-opacity">
                Skapa konto
              </Link>
              <Link href="/login" className="border border-edge rounded-xl px-5.5 py-3.5 text-[15px] font-semibold hover:border-lcd-dim transition-colors">
                Logga in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-edge/60">
        <div className="max-w-6xl mx-auto px-6 py-7 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5 text-muted text-[13px]">
            <div className="w-6.5 h-6.5 rounded-md bg-accent text-bg flex items-center justify-center font-mono font-extrabold text-[10px]">DL</div>
            DL Trainer — din personliga AI-träningsdashboard
          </div>
          <div className="flex gap-5 text-[13px] text-muted">
            <a href="#funktioner" className="hover:text-fg transition-colors">Funktioner</a>
            <a href="#sa-funkar-det" className="hover:text-fg transition-colors">Så funkar det</a>
            <Link href="/login" className="hover:text-fg transition-colors">Logga in</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
