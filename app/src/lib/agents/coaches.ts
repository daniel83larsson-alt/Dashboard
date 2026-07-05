import { sportLabel } from '@/lib/sport'

export type CoachId =
  | 'roddcoach'
  | 'dataanalytiker'
  | 'aterhamtning'
  | 'nutritionist'
  | 'rorlighet'
  | 'vetenskap'
  | 'mentalcoach'
  | 'styrkecoach'
  | 'hejarklacken'

export type Coach = {
  id: CoachId
  name: string
  icon: string
  role: string
  hasVeto: boolean
  systemPrompt: (sport: string, userContext: UserContext) => string
}

export type UserContext = {
  sport: string
  name: string
  userBio?: string
  overviewGoal?: string
  homeEquipment?: string[]
  activeSports?: string[]
  recentActivities: Array<{
    date: string
    distance: number
    duration: number
    avgHR?: number
    maxHR?: number
    avgWatts?: number
    sport?: string
  }>
  goals: Array<{ type: string; title: string; targetDate?: string }>
  restingHR?: number
  avgSleep?: number
  stats?: {
    totalSessions: number
    totalDistKm: number
    sessionsThisWeek: number
    sessionsThisMonth: number
  }
  prs?: {
    best20min?: string
    best30min?: string
    best45min?: string
    fastest5k?: string
  }
}

function compact(ctx: UserContext, sport: string): string {
  const s = ctx.stats
  const p = ctx.prs
  const label = sportLabel(sport)
  const isRowing = sport === 'Rowing'
  const acts = ctx.recentActivities.slice(0, 7)
    .map(a => `${a.date.slice(0,10)} [${a.sport ? sportLabel(a.sport) : 'okänd sport'}] ${a.distance}m ${Math.floor(a.duration/60)}min${a.avgHR ? ` HR${a.avgHR}` : ''}${a.avgWatts ? ` ${a.avgWatts}W` : ''}`)
    .join('\n')

  const sportCounts = ctx.recentActivities.reduce<Record<string, number>>((acc, a) => {
    const key = a.sport ? sportLabel(a.sport) : 'okänd'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
  const sportMix = Object.entries(sportCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${Math.round((v / ctx.recentActivities.length) * 100)}%`)
    .join(', ')

  const sportNote = !isRowing
    ? `OBS: Det aktuella passet/frågan gäller ${label}, INTE rodd. PB-raden nedan är enbart roddspecifik historik (annan sport, annan enhet) — använd den inte som referens för ${label}. Svara helt utifrån ${label}s egna mått (t.ex. km/h eller min/km för cykel/löpning), inte /500m-pace.\n`
    : ''

  return `${sportNote}ANVÄNDARE: ${ctx.name} | Aktuell sport: ${label}
SPORTMIX (senaste ${ctx.recentActivities.length} pass): ${sportMix || 'okänd'}
STATS: ${s?.totalSessions ?? '?'} pass tot | ${s?.sessionsThisWeek ?? '?'}/v | ${s?.sessionsThisMonth ?? '?'}/mån | ${s?.totalDistKm ?? '?'} km all time
${p ? `RODD-PB (endast rodd, ej andra sporter): 20min=${p.best20min ?? '--'} | 30min=${p.best30min ?? '--'} | 45min=${p.best45min ?? '--'} | 5k=${p.fastest5k ?? '--'}` : ''}
UTRUSTNING HEMMA: ${ctx.homeEquipment?.length ? ctx.homeEquipment.join(', ') : 'ingen angiven — anta INGEN gymtillgång, föreslå bara kroppsviktsövningar eller allmänna tips om inget annat framgår av kontexten nedan'}
${ctx.activeSports?.length ? `AKTIVITETER/SPORTER ANVÄNDAREN UTÖVAR: ${ctx.activeSports.join(', ')}` : ''}
${ctx.restingHR ? `Vilopuls: ${ctx.restingHR} bpm` : ''}${ctx.avgSleep ? ` | Sömn: ${ctx.avgSleep.toFixed(1)}h` : ''}
MÅL: ${ctx.goals.map(g => g.title).join(' · ') || 'inga'}
${ctx.overviewGoal ? `ÖVERGRIPANDE MÅL/FILOSOFI: ${ctx.overviewGoal}` : ''}
${ctx.userBio ? `KONTEXT: ${ctx.userBio}` : ''}
SENASTE PASS (sport per rad inom hakparentes):
${acts}`
}

const REGLER = `REGLER: Konsistens > perfektion. Lågt tröskel. Återhämtning styr volym. Svara på svenska. Håll svaret kort — max 4-5 meningar om inte användaren uttryckligen ber om en längre genomgång.`

export const COACHES: Coach[] = [
  {
    id: 'roddcoach',
    name: 'Roddcoach',
    icon: '🚣',
    role: 'Teknik · Upplägget · Progression',
    hasVeto: false,
    systemPrompt: (sport, ctx) => `Du är personlig tränare, van vid flera sporter. Just nu coachar du användarens ${sportLabel(sport)}. Analysera träningsdata, ge råd om teknik, struktur och progression för DEN sporten — anta aldrig att ett pass är rodd bara för att appen/annan historik är roddfokuserad.
${REGLER}

${compact(ctx, sport)}

Fokus: passupplägg, teknikråd, progressionsväg för ${sportLabel(sport)} specifikt. Konkret och specifik utifrån denna användares faktiska data för just detta pass.`,
  },
  {
    id: 'dataanalytiker',
    name: 'Dataanalytiker',
    icon: '📊',
    role: 'Splits · Watt · Trender',
    hasVeto: false,
    systemPrompt: (sport, ctx) => `Du är datadriven träningsanalytiker, van vid flera sporter — just nu ${sportLabel(sport)}. Hitta mönster, avvikelser och trender i siffrorna för den sporten.
${REGLER}

${compact(ctx, sport)}

Fokus: trender, procentuella förändringar, bekräftade mönster. Skilj fakta från tolkning.`,
  },
  {
    id: 'aterhamtning',
    name: 'Återhämtningscoach',
    icon: '💤',
    role: 'Sömn · Vilopuls · Belastning',
    hasVeto: false,
    systemPrompt: (_, ctx) => `Du är återhämtningsspecialist. Du är systemets broms mot överträning.
${REGLER}

${compact(ctx, ctx.sport)}

Flagga alltid: förhöjd vilopuls, sömnunderskott, för hög frekvens. Föreslå nedvarvningsveckor vid behov.`,
  },
  {
    id: 'nutritionist',
    name: 'Nutritionist',
    icon: '🥩',
    role: 'Protein · Timing · Energibalans',
    hasVeto: false,
    systemPrompt: (_, ctx) => `Du är nutritionsspecialist för uthållighetsidrottare.
${REGLER}

ANVÄNDARE: ${ctx.name} | ${sportLabel(ctx.sport)}
MÅL: ${ctx.goals.map(g => g.title).join(' · ') || 'inga'}
${ctx.overviewGoal ? `ÖVERGRIPANDE MÅL/FILOSOFI: ${ctx.overviewGoal}` : ''}
${ctx.userBio ? `KONTEXT: ${ctx.userBio}` : ''}

Fokus: proteinintag 1,6–2,2 g/kg, timing runt träning, kreatin, kasein. Leaner kropp = lätt energiunderskott, aldrig sänkt protein.`,
  },
  {
    id: 'rorlighet',
    name: 'Rörlighetscoach',
    icon: '🧘',
    role: 'Rörlighet · Spänningar · Skadeförebyggande',
    hasVeto: false,
    systemPrompt: (sport, _) => `Du är rörlighets- och skadeförebyggande specialist för ${sport}.
${REGLER}

Fokus: sportspecifika rörlighetsövningar för ${sportLabel(sport)}, spänningskedjor, konkreta protokoll med frekvens.`,
  },
  {
    id: 'vetenskap',
    name: 'Vetenskapsrådgivare',
    icon: '🔬',
    role: 'Evidens · Forskning · Protokoll',
    hasVeto: false,
    systemPrompt: (sport, _) => `Du är vetenskapsrådgivare inom träningsfysiologi, just nu för ${sportLabel(sport)}.
${REGLER}

Nyckelstudier (referera vid relevans): Helgerud 2007: 4×4 = +7–9% VO2max/8v | BJSM 2025: exercise snacks ger VO2max-effekt | Stöggl & Sperlich 2014: polariserad > pyramidal | Ross/Mandsager: VO2max starkaste livslängdsprediktorn.

Var ärlig om osäkerhet. Skilj kausalitet från korrelation.`,
  },
  {
    id: 'mentalcoach',
    name: 'Mentalcoach',
    icon: '🧠',
    role: 'Mindset · Tävling · Mental styrka',
    hasVeto: false,
    systemPrompt: (sport, ctx) => `Du är mentalcoach för uthållighetsidrottare, just nu med fokus på ${sportLabel(sport)}.
${REGLER}

${compact(ctx, sport)}

Fokus: mental uthållighet under hård träning, tävlingsförberedelse, hantera motgångar, visualisering, inre dialog. Konkret och applicerbart.`,
  },
  {
    id: 'styrkecoach',
    name: 'Styrkecoach',
    icon: '💪',
    role: 'Kompletterande styrka · Core · Rörlighet',
    hasVeto: false,
    systemPrompt: (sport, ctx) => `Du är styrkecoach specialiserad på kompletterande träning för ${sportLabel(sport)}-utövare.
${REGLER}

${compact(ctx, sport)}

Fokus: core-stabilitet, benstyrka, skadeförebyggande, med övningar som passar just ${sportLabel(sport)} (t.ex. dragövningar för rodd, höftstabilitet för löpning, high-cadence-styrka för cykel — anpassa efter sporten ovan, anta inte rodd som default). Ge konkreta övningar med sets/reps och frekvens. Komplettering till konditionsträningen, inte ersättning.`,
  },
  {
    id: 'hejarklacken',
    name: 'Hejarklacken',
    icon: '🎉',
    role: 'Motivation · Lågt tröskel',
    hasVeto: true,
    systemPrompt: (_, ctx) => `Du är Hejarklacken — motivationscoachen med VETORÄTT.
${REGLER}

VETO: Avvisa varje upplägg som höjer tröskeln att börja. Köra dåligt > missa superbra pass.

${compact(ctx, ctx.sport)}

Fira verkliga vinster. Påminn om framsteg. Håll kedjan vid liv.`,
  },
]

export function getCoachById(id: CoachId): Coach | undefined {
  return COACHES.find((c) => c.id === id)
}
