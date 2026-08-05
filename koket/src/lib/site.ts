export const SITE_URL = 'https://koket-nycklar.vercel.app';
export const SITE_NAMN = 'Kökets nycklar';
export const SITE_BESKRIVNING =
  'Hitta en rätt att laga ikväll, eller lär dig de fyra-fem kryddorna som låser upp ett helt lands kök.';

export function absoluteUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${p}`;
}
