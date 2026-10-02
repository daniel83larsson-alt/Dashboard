import type { SupabaseClient } from '@supabase/supabase-js'

// Daniel: coachen ska kunna säga till om pulszonerna verkar fel och föreslå
// tester. Regelbaserad rimlighetskontroll (inte AI-gissning) av Garmins sparade
// zongränser mot den puls personen faktiskt nått. Garmins standardzoner är
// procent av maxpuls (zon 5 börjar vid 90 %), så zon 5:s nedre gräns ger en
// uppskattad maxpuls. Vi kan inte ändra zoner i Garmin — bara rekommendera.
// Alla fynd formuleras som "värt att kolla", aldrig som fakta om personen.

export type ZoneCheckRow = {
  start_date: string
  moving_time?: number | null
  max_heartrate?: number | null
  hr_zones?: unknown
}

export type ZoneFinding = { code: 'max_too_low' | 'max_too_high' | 'zones_changed'; text: string }

export type ZoneCheck = {
  passes: number // pass med zondata som kontrollen bygger på
  estMaxHr: number | null // uppskattad maxpuls som zonerna bygger på (senaste passet)
  observedMaxHr: number | null // högsta puls som faktiskt uppmätts i perioden
  findings: ZoneFinding[]
}

const Z5_SHARE_OF_MAX = 0.9
const MIN_PASSES = 5
const MIN_PASSES_FOR_TOO_HIGH = 8
const MIN_SECS_FOR_TOO_HIGH = 1200 // bara pass ≥ 20 min räknas
const OVER_MAX_MARGIN_BPM = 5
const MIN_OVER_MAX_PASSES = 2
const ZONES_CHANGED_BPM = 5
const HR_PLAUSIBLE_MAX = 230 // över detta är det en felmätning, inte en maxpuls

type Zoned = { date: number; z5Low: number; maxHr: number | null; secs: number }

function zoned(rows: ZoneCheckRow[]): Zoned[] {
  const out: Zoned[] = []
  for (const r of rows) {
    if (!Array.isArray(r.hr_zones)) continue
    const z5 = (r.hr_zones as { zoneNumber?: number; zoneLowBoundary?: number }[]).find(z => z.zoneNumber === 5)
    if (!z5 || typeof z5.zoneLowBoundary !== 'number' || z5.zoneLowBoundary <= 0) continue
    const m = r.max_heartrate
    out.push({
      date: Date.parse(r.start_date),
      z5Low: z5.zoneLowBoundary,
      maxHr: typeof m === 'number' && m >= 60 && m <= HR_PLAUSIBLE_MAX ? m : null,
      secs: r.moving_time ?? 0,
    })
  }
  return out.sort((a, b) => a.date - b.date)
}

export function computeZoneCheck(rows: ZoneCheckRow[]): ZoneCheck | null {
  const z = zoned(rows)
  if (z.length < MIN_PASSES) return null

  const latest = z[z.length - 1]
  const estMax = Math.round(latest.z5Low / Z5_SHARE_OF_MAX)
  const observed = z.reduce<number | null>((m, p) => (p.maxHr != null && (m == null || p.maxHr > m) ? p.maxHr : m), null)
  const findings: ZoneFinding[] = []

  // Pulsen gick över den maxpuls zonerna bygger på (varje pass jämförs med SINA egna zoner).
  const overMax = z.filter(p => p.maxHr != null && p.maxHr > p.z5Low / Z5_SHARE_OF_MAX + OVER_MAX_MARGIN_BPM)
  if (overMax.length >= MIN_OVER_MAX_PASSES) {
    findings.push({
      code: 'max_too_low',
      text: `Din puls har gått över den maxpuls dina zoner bygger på (ca ${estMax} slag/min) i ${overMax.length} av ${z.length} pass — högst uppmätt ${observed}. Då kan maxpulsen i klockan vara satt för lågt, så att du hamnar i zon 5 för lätt.`,
    })
  }

  // Aldrig ens nära zon 5 trots många riktiga pass.
  const longPasses = z.filter(p => p.secs >= MIN_SECS_FOR_TOO_HIGH)
  if (longPasses.length >= MIN_PASSES_FOR_TOO_HIGH && observed != null && observed < latest.z5Low) {
    findings.push({
      code: 'max_too_high',
      text: `Du har inte nått zon 5 (från ${latest.z5Low} slag/min) i något av ${z.length} pass, högst uppmätt ${observed}. Antingen har passen varit lugna, eller så är maxpulsen i klockan (ca ${estMax}) satt högre än den verkliga.`,
    })
  }

  // Zongränserna har ändrats under perioden → jämförelser över tid haltar.
  const lows = z.map(p => p.z5Low)
  if (Math.max(...lows) - Math.min(...lows) >= ZONES_CHANGED_BPM) {
    findings.push({
      code: 'zones_changed',
      text: `Dina zongränser har ändrats under perioden (zon 5 började mellan ${Math.min(...lows)} och ${Math.max(...lows)} slag/min), så pass från olika tider är inte helt jämförbara i zonfördelning.`,
    })
  }

  return { passes: z.length, estMaxHr: estMax, observedMaxHr: observed, findings }
}

// Hålls kort och står sist i coachens kontext; coachen får BARA föreslå test
// när personen frågat om puls/zoner (se asksAboutHeartRate).
export const TEST_SUGGESTIONS =
  'Tester coachen får föreslå: (1) maxpulstest — värm upp 15 min, kör 3 stegrande 3-minutersintervaller där sista är så hårt du orkar, notera högsta puls; (2) 30-minuterstest för tröskelpuls — värm upp, kör 30 min så jämnt och hårt du kan, snittpulsen de sista 20 min är en bra uppskattning av tröskeln. Uppdatera sedan maxpuls/zoner i Garmin Connect (Användarinställningar → Pulszoner).'

export const TEST_SAFETY =
  'Säg ALLTID att maxpulstest är mycket ansträngande: bara om man är frisk och van vid hård träning, kolla med läkare först vid osäkerhet, hjärtproblem, medicinering eller lång träningspaus, och avbryt vid yrsel eller obehag. Ge aldrig medicinsk rådgivning.'

export function asksAboutHeartRate(message: string): boolean {
  return /puls|zon|hjärtfrekvens|\bhr\b|\bhrv\b/i.test(message)
}

export function formatZoneCheckForPrompt(c: ZoneCheck): string {
  const lines = [
    `ZONKONTROLL (senaste 90 dagarna, ${c.passes} pass med zondata): zonerna bygger på en maxpuls på ca ${c.estMaxHr}; högsta uppmätta puls ${c.observedMaxHr ?? 'okänd'}.`,
  ]
  if (c.findings.length) for (const f of c.findings) lines.push(`- ${f.text}`)
  else lines.push('- Inget tyder på att zonerna är fel inställda.')
  lines.push(TEST_SUGGESTIONS, TEST_SAFETY)
  lines.push('Svara på frågan om puls/zoner utifrån ZONKONTROLL. Säg att det är en rimlighetskontroll av mönster, inte ett facit, och att du inte kan ändra klockan åt personen.')
  return lines.join('\n')
}

// Kort, fast text för recap-kortet och mejlet (regelstyrd, ingen AI): första
// fyndet + en uppmaning att fråga coachen. Inget testförslag i detalj här —
// försiktighetsraden följer med när coachen själv beskriver testet.
export function zoneCheckNote(c: ZoneCheck | null | undefined): { text: string; tip: string } | null {
  // "Zongränser ändrade" är bara information för coachen — i ett veckomejl
  // skulle den dyka upp varje vecka, så bara de två "kolla maxpulsen"-fynden visas.
  const f = c?.findings.find(x => x.code === 'max_too_low' || x.code === 'max_too_high')
  if (!f) return null
  return {
    text: f.text,
    tip: 'Fråga coachen om dina pulszoner — den kan föreslå ett test för att få rätt maxpuls (kolla din hälsa först, maxpulstest är mycket ansträngande).',
  }
}

// Smal hämtning: bara tre fält + zonerna via JSON-path (inte hela raw_data).
export async function fetchZoneCheck(supabase: SupabaseClient, userId: string, now: Date = new Date()): Promise<ZoneCheck | null> {
  const since = new Date(now.getTime() - 90 * 86400000).toISOString()
  const { data } = await supabase.from('activities')
    .select('start_date, moving_time, max_heartrate, hr_zones:raw_data->hrZones')
    .eq('user_id', userId).gte('start_date', since).lte('start_date', now.toISOString())
  return computeZoneCheck((data ?? []) as unknown as ZoneCheckRow[])
}
