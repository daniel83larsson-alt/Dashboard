import type { SupabaseClient } from '@supabase/supabase-js'

// Daniel: coachen ska kunna säga till om pulszonerna verkar fel och föreslå
// tester. Regelbaserad rimlighetskontroll (inte AI-gissning) av Garmins sparade
// zongränser mot den puls personen faktiskt nått. Garmins standardzoner är
// procent av maxpuls (zon 5 börjar vid 90 %), så zon 5:s nedre gräns ger en
// uppskattad maxpuls. Vi kan inte ändra zoner i Garmin — bara rekommendera.
// Alla fynd formuleras som "värt att kolla", aldrig som fakta om personen.

export type ZoneCheckRow = {
  start_date: string
  average_heartrate?: number | null
  moving_time?: number | null
  max_heartrate?: number | null
  hr_zones?: unknown
}

export type ZoneFinding = { code: 'max_too_low' | 'max_too_high' | 'zones_changed' | 'z2_drift' | 'z2_below'; text: string }

export type ZoneCheck = {
  passes: number // pass med zondata som kontrollen bygger på
  estMaxHr: number | null // uppskattad maxpuls som zonerna bygger på (senaste passet)
  observedMaxHr: number | null // högsta puls som faktiskt uppmätts i perioden
  findings: ZoneFinding[]
  // Lugna pass (zon 2-träning) — null när för få lugna pass finns.
  lowZones: { easyPasses: number; z1Pct: number; z2Pct: number; z3PlusPct: number; z2Range: [number, number]; avgHr: number | null } | null
}

const Z5_SHARE_OF_MAX = 0.9
const MIN_PASSES = 5
const MIN_PASSES_FOR_TOO_HIGH = 8
const MIN_SECS_FOR_TOO_HIGH = 1200 // bara pass ≥ 20 min räknas
const OVER_MAX_MARGIN_BPM = 5
const MIN_OVER_MAX_PASSES = 2
const ZONES_CHANGED_BPM = 5
const HR_PLAUSIBLE_MAX = 230 // över detta är det en felmätning, inte en maxpuls

type ZoneSecs = [number, number, number, number, number]
type Zoned = { date: number; z5Low: number; z2Low: number | null; z3Low: number | null; maxHr: number | null; avgHr: number | null; secs: number; zoneSecs: ZoneSecs }

function zoned(rows: ZoneCheckRow[]): Zoned[] {
  const out: Zoned[] = []
  for (const r of rows) {
    if (!Array.isArray(r.hr_zones)) continue
    const z5 = (r.hr_zones as { zoneNumber?: number; zoneLowBoundary?: number }[]).find(z => z.zoneNumber === 5)
    if (!z5 || typeof z5.zoneLowBoundary !== 'number' || z5.zoneLowBoundary <= 0) continue
    const m = r.max_heartrate
    const zs: ZoneSecs = [0, 0, 0, 0, 0]
    const lowOf = (n: number) => {
      const b = (r.hr_zones as { zoneNumber?: number; zoneLowBoundary?: number }[]).find(z => z.zoneNumber === n)?.zoneLowBoundary
      return typeof b === 'number' && b > 0 ? b : null
    }
    for (const z of r.hr_zones as { zoneNumber?: number; secsInZone?: number }[]) {
      if (z.zoneNumber != null && z.zoneNumber >= 1 && z.zoneNumber <= 5 && typeof z.secsInZone === 'number') zs[z.zoneNumber - 1] += z.secsInZone
    }
    out.push({
      date: Date.parse(r.start_date),
      z2Low: lowOf(2),
      z3Low: lowOf(3),
      avgHr: typeof r.average_heartrate === 'number' && r.average_heartrate > 0 ? r.average_heartrate : null,
      zoneSecs: zs,
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
  const spread = (vals: (number | null)[]) => {
    const v = vals.filter((x): x is number => x != null)
    return v.length ? Math.max(...v) - Math.min(...v) : 0
  }
  if (Math.max(spread(z.map(p => p.z5Low)), spread(z.map(p => p.z2Low)), spread(z.map(p => p.z3Low))) >= ZONES_CHANGED_BPM) {
    const l2 = z.filter(p => p.z2Low != null).map(p => p.z2Low as number)
    findings.push({
      code: 'zones_changed',
      text: `Dina zongränser har ändrats under perioden (t.ex. zon 2 började mellan ${Math.min(...l2)} och ${Math.max(...l2)} slag/min), så pass från olika tider är inte helt jämförbara i zonfördelning.`,
    })
  }

  const lowZones = computeLowZones(z, latest, findings)
  return { passes: z.length, estMaxHr: estMax, observedMaxHr: observed, findings, lowZones }
}

const EASY_MIN_SECS = 1200 // lugna pass räknas från 20 min
const EASY_MAX_HARD_SHARE = 0.1 // ≤10 % i zon 4–5 = lugnt pass
const MIN_EASY_PASSES = 5
const Z3_DRIFT_SHARE = 0.25 // median ≥25 % av tiden i zon 3+ på lugna pass = glider
const Z1_ONLY_SHARE = 0.6 // median ≥60 % i zon 1 och <25 % i zon 2 = under zon 2

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Daniel: "bygg för låga zonerna — det är där de flesta användare kör".
// Ett "lugnt pass" = ≥20 min med högst 10 % av tiden i zon 4–5. Avsikten
// (var personen TÄNKTE köra zon 2) är okänd, så fynden är mönster, inte facit.
//
// Bara pass med SAMMA zondefinition som senaste passet räknas: om användaren
// nyligen ändrat sina zoner (t.ex. efter ett test) skulle äldre pass annars
// mätas mot gamla gränser och ge ett missvisande fynd. Tiden i varje zon är
// redan uträknad av Garmin mot de gränser som gällde då, och vi har ingen
// pulskurva att räkna om med — så vi väntar tills det finns ≥5 pass med de nya.
function computeLowZones(all: Zoned[], latest: Zoned, findings: ZoneFinding[]): ZoneCheck['lowZones'] {
  const z = all.filter(p => p.z2Low === latest.z2Low && p.z3Low === latest.z3Low)
  const easy = z.filter(p => {
    const tot = p.zoneSecs.reduce((s, x) => s + x, 0)
    return p.secs >= EASY_MIN_SECS && tot > 0 && (p.zoneSecs[3] + p.zoneSecs[4]) / tot <= EASY_MAX_HARD_SHARE
  })
  if (easy.length < MIN_EASY_PASSES || latest.z2Low == null || latest.z3Low == null) return null

  const share = (p: Zoned, idx: number[]) => idx.reduce((s, i) => s + p.zoneSecs[i], 0) / p.zoneSecs.reduce((s, x) => s + x, 0)
  const z1 = median(easy.map(p => share(p, [0])))
  const z2 = median(easy.map(p => share(p, [1])))
  const z3p = median(easy.map(p => share(p, [2, 3, 4])))
  const hrs = easy.map(p => p.avgHr).filter((x): x is number => x != null)
  const avgHr = hrs.length ? Math.round(hrs.reduce((s, x) => s + x, 0) / hrs.length) : null
  const range: [number, number] = [latest.z2Low, latest.z3Low - 1]
  const pct = (x: number) => Math.round(x * 100)

  if (z3p >= Z3_DRIFT_SHARE) {
    findings.push({
      code: 'z2_drift',
      text: `På dina lugna pass (${easy.length} st) ligger i mitten ${pct(z3p)} % av tiden i zon 3 eller högre och bara ${pct(z2)} % i zon 2 (zon 2 = ${range[0]}–${range[1]} slag/min). Antingen glider farten upp över det lugna, eller så är zon 2:s gränser satta för lågt.`,
    })
  } else if (z1 >= Z1_ONLY_SHARE && z2 < 0.25) {
    findings.push({
      code: 'z2_below',
      text: `På dina lugna pass (${easy.length} st) ligger i mitten ${pct(z1)} % av tiden i zon 1 och bara ${pct(z2)} % i zon 2 (zon 2 = ${range[0]}–${range[1]} slag/min). Du kör alltså lugnare än zon 2 — eller så är zon 2:s gränser satta för högt.`,
    })
  }
  return { easyPasses: easy.length, z1Pct: pct(z1), z2Pct: pct(z2), z3PlusPct: pct(z3p), z2Range: range, avgHr }
}

// Hålls kort och står sist i coachens kontext; coachen får BARA föreslå test
// när personen frågat om puls/zoner (se asksAboutHeartRate).
export const TEST_SUGGESTIONS =
  'Tester coachen får föreslå: (1) maxpulstest — värm upp 15 min, kör 3 stegrande 3-minutersintervaller där sista är så hårt du orkar, notera högsta puls; (2) 30-minuterstest för tröskelpuls — värm upp, kör 30 min så jämnt och hårt du kan, snittpulsen de sista 20 min är en bra uppskattning av tröskeln. Uppdatera sedan maxpuls/zoner i Garmin Connect (Användarinställningar → Pulszoner).'

export const TEST_SAFETY =
  'Säg ALLTID att maxpulstest är mycket ansträngande: bara om man är frisk och van vid hård träning, kolla med läkare först vid osäkerhet, hjärtproblem, medicinering eller lång träningspaus, och avbryt vid yrsel eller obehag. Ge aldrig medicinsk rådgivning.'

export function asksAboutHeartRate(message: string): boolean {
  return /puls|zon|hjärtfrekvens|\bhr\b|\bhrv\b|\b[lz][1-5]\b|lågpuls/i.test(message)
}

export function formatZoneCheckForPrompt(c: ZoneCheck): string {
  const lines = [
    `ZONKONTROLL (senaste 90 dagarna, ${c.passes} pass med zondata): zonerna bygger på en maxpuls på ca ${c.estMaxHr}; högsta uppmätta puls ${c.observedMaxHr ?? 'okänd'}.`,
  ]
  if (c.findings.length) for (const f of c.findings) lines.push(`- ${f.text}`)
  else lines.push('- Inget tyder på att zonerna är fel inställda.')
  if (c.lowZones) {
    const l = c.lowZones
    lines.push(`LÅGA ZONER (${l.easyPasses} lugna pass ≥20 min med ≤10 % i zon 4–5): mitten av tiden i zon 1 ${l.z1Pct} %, zon 2 ${l.z2Pct} %, zon 3+ ${l.z3PlusPct} %; zon 2 = ${l.z2Range[0]}–${l.z2Range[1]} slag/min${l.avgHr != null ? `; snittpuls på dessa pass ${l.avgHr}` : ''}. Praktiskt prov för zon 2: man ska kunna prata hela meningar (pratprov) och pulsen bör hålla sig i zon 2:s spann.`)
  }
  else if (c.findings.some(f => f.code === 'zones_changed')) {
    lines.push('LÅGA ZONER: zongränserna ändrades nyligen och det finns för få lugna pass (minst 5 krävs) med de nya zonerna för att bedöma zon 2 än. Säg det och be personen köra några lugna pass, utvärdera sedan. Bedöm INTE zon 2 mot de gamla passen.')
  }
  lines.push(TEST_SUGGESTIONS, TEST_SAFETY)
  lines.push('Svara på frågan om puls/zoner utifrån ZONKONTROLL. Säg att det är en rimlighetskontroll av mönster, inte ett facit, och att du inte kan ändra klockan åt personen.')
  return lines.join('\n')
}

// Kort, fast text för recap-kortet och mejlet (regelstyrd, ingen AI): första
// fyndet + en uppmaning att fråga coachen. Inget testförslag i detalj här —
// försiktighetsraden följer med när coachen själv beskriver testet.
export function zoneCheckNote(c: ZoneCheck | null | undefined): { text: string; tip: string } | null {
  // "Zongränser ändrade" är bara information för coachen — i ett veckomejl
  // skulle den dyka upp varje vecka, så bara de fynd man kan agera på visas.
  const f = c?.findings.find(x => x.code === 'max_too_low' || x.code === 'max_too_high' || x.code === 'z2_drift' || x.code === 'z2_below')
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
    .select('start_date, moving_time, max_heartrate, average_heartrate, hr_zones:raw_data->hrZones')
    .eq('user_id', userId).gte('start_date', since).lte('start_date', now.toISOString())
  return computeZoneCheck((data ?? []) as unknown as ZoneCheckRow[])
}
