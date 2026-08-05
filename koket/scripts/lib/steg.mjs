// Delar upp en enda metod-paragraf (rå text, ev. med **fetstil**-markörer redan inlagda)
// i diskreta steg vid naturliga mening/handlings-gränser.
//
// Regel: bryt vid ". " / "! " / "? " följt av stor bokstav eller siffra — men om
// fragmentet som följer bara är en löst hängande tids-/temperaturangivelse utan eget
// verb (t.ex. "15 min.", "225°C." — börjar med en siffra), slå ihop det med föregående
// steg istället för att låta det stå som ett eget meningslöst steg.
export function delaINaturligaSteg(text) {
  const normaliserad = text.replace(/\s+/g, ' ').trim();
  if (!normaliserad) return [];

  // Splitta vid meningsgräns: skiljetecken + mellanslag + versal/siffra.
  // Lookbehind tillåter att föregående mening slutar inuti fetstil (…ord.**), och
  // lookahead att nästa mening börjar med fetstil (**Ord) — annars missas gränsen
  // när <b>-taggen råkar ligga precis kring meningsslutet.
  const rawParts = normaliserad.split(/(?<=[.!?]\*{0,2})\s+(?=\*{0,2}[A-ZÅÄÖ0-9])/);

  const steg = [];
  for (const part of rawParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const ärLösTidsangivelse = /^\d/.test(trimmed) || /^ca\.?\s*\d/.test(trimmed);
    if (ärLösTidsangivelse && steg.length > 0) {
      steg[steg.length - 1] = `${steg[steg.length - 1]} ${trimmed}`;
    } else {
      steg.push(trimmed);
    }
  }
  return steg;
}

// Konverterar innerHTML från <p class="step"> (som kan innehålla <b>…</b>) till
// vanlig text med markdown **fetstil**, redo för meningsdelning.
export function htmlTillMarkdownFetstil(html) {
  return html
    .replace(/<(b|strong)>/g, '**')
    .replace(/<\/(b|strong)>/g, '**')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .trim();
}
