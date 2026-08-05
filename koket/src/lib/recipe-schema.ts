import type { CollectionEntry } from 'astro:content';
import { absoluteUrl, SITE_NAMN } from './site';

// Datum grundade i verklig historik, inte påhittade: koket/index.html (källan för hela
// migreringen) tillkom 2026-08-02 i git-historiken; den här ombyggnaden publicerades
// 2026-08-05 (dagens datum vid migreringen). Samma par används för alla 56 recept —
// vi har ingen per-recept-historik i källan att hämta ett äkta unikt datum ur.
const DATUM_PUBLICERAD = '2026-08-02';
const DATUM_UPPDATERAD = '2026-08-05';

function tidMinuterTillPT(minuter: number | null): string | undefined {
  if (minuter === null || minuter === undefined) return undefined;
  return `PT${minuter}M`;
}

export function genereraRecipeJsonLd(
  ratt: CollectionEntry<'ratter'>,
  kok: CollectionEntry<'kok'>,
) {
  const { titel, teaser, ingredienser, steg, tidMinuter, bild, land: landRef } = ratt.data;
  void landRef;

  const recipeIngredient = ingredienser.map((i) =>
    i.mangd ? `${i.mangd} ${i.namn}` : i.namn,
  );

  const recipeInstructions = steg.map((s, i) => ({
    '@type': 'HowToStep',
    position: i + 1,
    // JSON-LD är inte markdown — enkla **fetstil**-markörer i steg-texten plockas bort
    // här (de renderas som riktig <strong> i själva sidans HTML istället).
    text: s.replace(/\*\*/g, ''),
  }));

  const bildUrl = absoluteUrl(bild.fil);

  const json: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: titel,
    description: teaser,
    image: [bildUrl],
    recipeIngredient,
    recipeInstructions,
    recipeCuisine: kok.data.land,
    keywords: [kok.data.land, titel, ratt.data.typ === 'brod' ? 'bröd' : ratt.data.typ === 'kebab' ? 'kebab' : 'huvudrätt'].join(', '),
    recipeCategory: ratt.data.typ === 'brod' ? 'Bröd' : ratt.data.typ === 'kebab' ? 'Kebab' : 'Huvudrätt',
    inLanguage: 'sv-SE',
    author: {
      '@type': 'Organization',
      name: SITE_NAMN,
    },
    datePublished: DATUM_PUBLICERAD,
    dateModified: DATUM_UPPDATERAD,
  };

  const totalTime = tidMinuterTillPT(tidMinuter);
  if (totalTime) json.totalTime = totalTime;

  // Uttryckligen INTE med (se STATUS/rapport för varför):
  //   recipeYield, prepTime, cookTime — datan finns inte i källan, ska inte hittas på.
  //   nutrition — ingen näringsdata finns.
  //   aggregateRating / review — inga riktiga användarbetyg finns; falska betyg
  //   riskerar en manuell Google-åtgärd och läggs aldrig till utan äkta data.

  return json;
}

export function genereraOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAMN,
    url: absoluteUrl('/'),
  };
}

export function genereraWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAMN,
    url: absoluteUrl('/'),
    inLanguage: 'sv-SE',
  };
}

export function genereraBreadcrumbJsonLd(items: { namn: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.namn,
      item: absoluteUrl(item.url),
    })),
  };
}

export function genereraItemListJsonLd(namn: string, items: { namn: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: namn,
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.namn,
      url: absoluteUrl(item.url),
    })),
  };
}
