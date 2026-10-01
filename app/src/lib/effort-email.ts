import { ZONE_COLORS, ZONE_LABELS } from './zones'
import type { EffortSummary } from './effort-summary'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Shared by the weekly + monthly recap emails: a stacked zone bar (table
// cells, since email clients ignore most modern CSS), the "X av Y pass"
// coverage, Garmin Training Effect, and the AI's one-sentence comment.
export function effortEmailHtml(effort: EffortSummary | null | undefined, sentence: string | null | undefined, heading: string): string {
  if (!effort) return ''
  const bar = effort.zones.length
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-radius:6px;overflow:hidden;margin:0 0 6px;"><tr>${effort.zones
        .filter(z => z.pct > 0)
        .map(z => `<td width="${z.pct}%" height="10" style="background:${ZONE_COLORS[z.zoneNumber - 1] ?? '#999'};font-size:0;line-height:0;">&nbsp;</td>`)
        .join('')}</tr></table>
       <p style="margin:0 0 6px;color:#555;font-size:12px;">${effort.zones
         .map(z => `${esc((ZONE_LABELS[z.zoneNumber - 1] ?? `Zon ${z.zoneNumber}`).split(' · ')[0])} ${z.pct} %`)
         .join(' · ')} <span style="color:#999;">(${effort.zonePasses} av ${effort.totalPasses} pass)</span></p>`
    : ''
  const te = effort.tePasses > 0
    ? `<p style="margin:0 0 6px;color:#555;font-size:12px;">Träningseffekt (Garmin, 0–5): aerob snitt ${effort.teAvgAerobic ?? '–'}, anaerob ${effort.teAvgAnaerobic ?? '–'}${effort.hardest ? ` · hårdast: ${esc(effort.hardest.label)} ${effort.hardest.startDate.slice(0, 10)} (aerob ${effort.hardest.aerobic ?? '–'})` : ''}</p>`
    : ''
  const text = sentence ? `<p style="margin:8px 0 0;color:#1a1a1a;line-height:1.5;font-size:13.5px;">${esc(sentence)}</p>` : ''
  return `<div style="margin:0 0 16px;padding:14px 16px;background:#f4f4f2;border-radius:12px;">
    <p style="margin:0 0 8px;color:#777;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">${esc(heading)}</p>
    ${bar}${te}${text}
  </div>`
}
