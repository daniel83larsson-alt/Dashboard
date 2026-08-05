// Minimal hjälpfunktion: delar en sträng med **fetstil**-markörer i delar, för
// användning i .astro-mallar utan att dra in en hel markdown-renderare för en enda
// funktion. Ingen körtids-JS krävs — allt sker vid byggtillfället.
export interface TextDel {
  text: string;
  fet: boolean;
}

export function delaFetstil(text: string): TextDel[] {
  const delar: TextDel[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let senastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > senastIndex) {
      delar.push({ text: text.slice(senastIndex, match.index), fet: false });
    }
    delar.push({ text: match[1], fet: true });
    senastIndex = match.index + match[0].length;
  }
  if (senastIndex < text.length) {
    delar.push({ text: text.slice(senastIndex), fet: false });
  }
  return delar;
}
