#!/usr/bin/env node
// Migrerar koket/index.html (legacy, statisk HTML/CSS/JS) till Astro content collections.
//
// Kör: node scripts/extrahera-fran-legacy.mjs
//
// Källa: index.html i denna mapp (den ursprungliga statiska sajten — ligger kvar
// bredvid src/ för spårbarhet, körs aldrig av Astro).
//
// Skriver:
//   src/content/kok/<slug>.md        (18 st)
//   src/content/ratter/<land>--<slug>.md  (56 st)
//   public/bilder/<land>/<slug>.<ext>     (56 st, nedladdade från Wikimedia Commons)
//
// Avbryter (process.exit(1)) om något av följande inte stämmer:
//   - inte exakt 18 kök
//   - inte exakt 56 rätter (40 länderrätter + 6 bröd + 10 kebab)
//   - en bild går inte att slå upp/ladda ner från Wikimedia Commons
//   - en cuisine-slug krockar med en reserverad rutt

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { delaINaturligaSteg, htmlTillMarkdownFetstil } from './lib/steg.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LEGACY_HTML_PATH = join(ROOT, 'index.html');

const RESERVERADE_SLUGS = new Set([
  'kryddor', 'basvaror', 'brod', 'kebab', 'protein', 'regler',
  'om', 'inkopslista', 'kontakt', 'cookies', 'integritetspolicy',
]);

// ── Kök-metadata som inte går att läsa mekaniskt ur DOM:en (tema-färg, om texten ska
// vara mörk mot ljus bakgrund) — hämtat direkt ur legacy-CSS:ens klass-till-variabel-karta. ──
const TEMA_PER_SLUG = {
  spanien: 'es', italien: 'it', turkiet: 'tr', japan: 'jp', thailand: 'th',
  mellanostern: 'me', baltikum: 'ba', indien: 'in', mexiko: 'mx', grekland: 'gr',
  marocko: 'ma', korea: 'kr', vietnam: 'vn', kina: 'cn', frankrike: 'fr',
  vastafrika: 'wa', peru: 'pe', etiopien: 'et',
};
const MORK_TEXT_SLUGS = new Set(['indien', 'vastafrika']); // .in / .wa har svart text i legacy-CSS

// Svenska adjektivformer per kök — går inte att härleda mekaniskt ur landsnamnet
// (t.ex. "Spanien" → "spanska", inte "spanieniska"), så en uttrycklig karta istället
// för en trasig strängmanipulation i brödtexten.
const ADJEKTIV_PER_SLUG = {
  spanien: 'spanska', italien: 'italienska', turkiet: 'turkiska', japan: 'japanska',
  thailand: 'thailändska', baltikum: 'baltiska', indien: 'indiska', mexiko: 'mexikanska',
  grekland: 'grekiska', marocko: 'marockanska', korea: 'koreanska', vietnam: 'vietnamesiska',
  kina: 'kinesiska', frankrike: 'franska', vastafrika: 'västafrikanska', peru: 'peruanska',
  etiopien: 'etiopiska',
  // Mellanöstern har ingen naturlig enkel adjektivform på svenska — hanteras med en
  // egen meningskonstruktion i byggKokBrodtext istället.
};

// ── Bröd & kebab har inget data-time i källan (det attributet fanns bara på
// länder-rätterna). Hinkarna nedan är en redaktionell bedömning gjord av samma
// kriterier som författaren själv verkar ha använt på de 40 länderrätterna
// (se rapport: kalibrerad mot faktiska data-time/mins-par i källan). Dokumenterad
// avvikelse — inte härledd mekaniskt, eftersom data helt enkelt inte finns i källan. ──
const TID_BUCKET_OVERRIDE = {
  'b-focaccia': 'medel',
  'b-pita': 'medel',
  'b-tortilla': 'snabb',
  'b-naan': 'medel',
  'b-lantbrod': 'langsam',
  'b-injera': 'langsam',
  'k-souvlaki': 'medel',
  'k-seekh': 'medel',
  'k-kefta': 'medel',
  'k-chuanr': 'medel',
  'k-dakkochi': 'snabb',
  'k-anticuchos': 'medel',
  'k-suya': 'snabb',
  'k-mooping': 'medel',
  'k-doner': 'langsam',
  'k-shawarma': 'middag',
};

// Bröd/kebab-rätter med dubbel eller oklar landstillhörighet i källan — canonical
// land + ev. cross-link-notis till det andra landet.
const CANONICAL_LAND_OVERRIDE = {
  'b-pita': { land: 'mellanostern', flagRaw: 'Mellanöstern / Turkiet', crossLink: { land: 'turkiet', notis: 'Pitabröd hör lika mycket hemma i det turkiska köket — vi har lagt receptet under Mellanöstern eftersom källan listade det landet först, men länkar hit från Turkiet.' } },
  'b-lantbrod': { land: 'frankrike', flagRaw: 'Frankrike / allmänt', crossLink: null },
};

function asciiFold(str) {
  // Unicode-normalisera bort diakritiska tecken (å/ä/ö/é/í/ñ/… → a/a/o/e/i/n/…),
  // sedan resten till kebab-case. Ger samma stil som de redan ascii-folded
  // köks-sluggarna i källan (t.ex. "mellanostern", "vastafrika").
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function frontmatterYaml(obj, indent = 0) {
  // Minimal, deterministisk YAML-serialisering (vi kontrollerar formen helt själva,
  // så vi slipper ett extra beroende för det här engångsskriptet).
  const pad = '  '.repeat(indent);
  const lines = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      lines.push(`${pad}${key}: null`);
    } else if (typeof value === 'string') {
      lines.push(`${pad}${key}: ${yamlString(value)}`);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      lines.push(`${pad}${key}: ${value}`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${pad}${key}: []`);
      } else if (typeof value[0] === 'object' && value[0] !== null) {
        lines.push(`${pad}${key}:`);
        for (const item of value) {
          const itemLines = frontmatterYaml(item, indent + 1).split('\n');
          lines.push(`${pad}  - ${itemLines[0].trim()}`);
          for (const l of itemLines.slice(1)) lines.push(`  ${l}`);
        }
      } else {
        lines.push(`${pad}${key}:`);
        for (const item of value) {
          lines.push(`${pad}  - ${yamlString(String(item))}`);
        }
      }
    } else if (typeof value === 'object') {
      lines.push(`${pad}${key}:`);
      lines.push(frontmatterYaml(value, indent + 1));
    }
  }
  return lines.join('\n');
}

function yamlString(s) {
  // Dubbelcitera alltid och escapa — enklast robust för fri text med kolon,
  // citattecken, radbryt m.m.
  return JSON.stringify(s);
}

// ── Läs och parsa legacy-HTML ──
if (!existsSync(LEGACY_HTML_PATH)) {
  console.error(`FEL: hittar inte legacy-källan på ${LEGACY_HTML_PATH}`);
  process.exit(1);
}
const html = readFileSync(LEGACY_HTML_PATH, 'utf-8');
const { document } = parseHTML(html);

// ── 1. Kök (band-sektioner) ──
const bandEls = Array.from(document.querySelectorAll('section.band'));
console.log(`Hittade ${bandEls.length} kök (.band)`);
if (bandEls.length !== 18) {
  console.error(`FEL: förväntade exakt 18 kök, hittade ${bandEls.length}. Avbryter.`);
  process.exit(1);
}

const kokData = [];
for (const band of bandEls) {
  const slug = band.id;
  if (RESERVERADE_SLUGS.has(slug)) {
    console.error(`FEL: köks-slug "${slug}" krockar med en reserverad rutt. Avbryter.`);
    process.exit(1);
  }
  const land = band.querySelector('h2').textContent.trim();
  const tagline = band.querySelector('.flag').textContent.trim();
  const nycklar = Array.from(band.querySelectorAll('.keys li')).map((li) => li.textContent.trim());
  const why = band.querySelector('.why').textContent.trim();
  const drinkEl = band.querySelector('.drink');
  const dryckNamn = drinkEl.querySelector('b + p strong, p strong')?.textContent.trim() || '';
  const dryckBeskrivning = drinkEl.querySelector('p').textContent.trim();
  const dryckUrl = drinkEl.querySelector('a.drink-link').getAttribute('href');
  const tema = TEMA_PER_SLUG[slug];
  if (!tema) {
    console.error(`FEL: inget tema-kod-mapping för köks-slug "${slug}". Avbryter.`);
    process.exit(1);
  }
  kokData.push({
    slug, land, tagline, nycklar, why,
    tema, morkText: MORK_TEXT_SLUGS.has(slug),
    dryck: { namn: dryckNamn, beskrivning: dryckBeskrivning, url: dryckUrl },
  });
}

// ── 2. Rätter: 40 länderrätter (.dish inuti .band, ej bread-card) ──
const ratterRaw = [];

for (const band of bandEls) {
  const landSlug = band.id;
  const dishEls = Array.from(band.querySelectorAll('.dish:not(.bread-card)'));
  let ordning = 1;
  for (const dishEl of dishEls) {
    ratterRaw.push(extraheraRatt(dishEl, { typ: 'ratt', landSlug, ordning: ordning++ }));
  }
}

// ── 3. Bröd (6 st, tab-brod) ──
const brodSection = document.querySelector('#brod');
const brodDishEls = Array.from(brodSection.querySelectorAll('.dish.bread-card'));
let brodOrdning = 1;
for (const dishEl of brodDishEls) {
  const id = dishEl.id;
  const override = CANONICAL_LAND_OVERRIDE[id];
  const flagText = dishEl.querySelector('.flag').textContent.trim();
  const landSlug = override ? override.land : gissaLandFranFlagga(flagText, kokData);
  ratterRaw.push(extraheraRatt(dishEl, {
    typ: 'brod', landSlug, ordning: brodOrdning++,
    crossLink: override ? override.crossLink : null,
  }));
}

// ── 4. Kebab (10 st, tab-kebab) ──
const kebabSection = document.querySelector('#kebab');
const kebabDishEls = Array.from(kebabSection.querySelectorAll('.dish.bread-card'));
let kebabOrdning = 1;
for (const dishEl of kebabDishEls) {
  const flagText = dishEl.querySelector('.flag').textContent.trim();
  const landSlug = gissaLandFranFlagga(flagText, kokData);
  ratterRaw.push(extraheraRatt(dishEl, { typ: 'kebab', landSlug, ordning: kebabOrdning++ }));
}

console.log(`Hittade ${ratterRaw.length} rätter totalt (ska vara 56: 40 länder + 6 bröd + 10 kebab)`);
if (ratterRaw.length !== 56) {
  console.error(`FEL: förväntade exakt 56 rätter, hittade ${ratterRaw.length}. Avbryter.`);
  process.exit(1);
}
const antalRatt = ratterRaw.filter((r) => r.typ === 'ratt').length;
const antalBrod = ratterRaw.filter((r) => r.typ === 'brod').length;
const antalKebab = ratterRaw.filter((r) => r.typ === 'kebab').length;
if (antalRatt !== 40 || antalBrod !== 6 || antalKebab !== 10) {
  console.error(`FEL: fel fördelning — ratt=${antalRatt} (ska 40), brod=${antalBrod} (ska 6), kebab=${antalKebab} (ska 10). Avbryter.`);
  process.exit(1);
}

function gissaLandFranFlagga(flagText, kokList) {
  // flagText t.ex. "Grekland", "Frankrike / allmänt" (hanteras via override ovan),
  // matchar mot kok-listans land-namn.
  const forsta = flagText.split('/')[0].trim();
  const match = kokList.find((k) => k.land === forsta);
  if (!match) {
    console.error(`FEL: kunde inte matcha flagga "${flagText}" mot ett känt kök. Avbryter.`);
    process.exit(1);
  }
  return match.slug;
}

function extraheraRatt(dishEl, { typ, landSlug, ordning, crossLink = null }) {
  const id = dishEl.id;
  const titel = dishEl.querySelector('h3').textContent.trim();
  const minsRaw = dishEl.querySelector('.mins').textContent.trim();
  const teaser = dishEl.querySelector('.dish-teaser').textContent.trim();
  const imgEl = dishEl.querySelector('figure.dish-shot img');
  const imgSrc = imgEl.getAttribute('src');

  const ingList = Array.from(dishEl.querySelectorAll('.ing-list li')).map((li) => {
    const spans = li.querySelectorAll('span');
    return {
      namn: (spans[0]?.textContent || '').trim(),
      mangd: (spans[1]?.textContent || '').trim(),
    };
  });

  const stepEl = dishEl.querySelector('p.step');
  const stepHtml = stepEl ? stepEl.innerHTML : '';
  const stepMd = htmlTillMarkdownFetstil(stepHtml);
  const steg = delaINaturligaSteg(stepMd);

  const tipEl = dishEl.querySelector('p.tip');
  const tips = tipEl ? tipEl.textContent.trim() : '';

  let protein = null;
  const swapEl = dishEl.querySelector('p.swap');
  if (swapEl) {
    const kott = swapEl.querySelector('span[data-p="kott"]')?.textContent.trim() || '';
    const fisk = swapEl.querySelector('span[data-p="fisk"]')?.textContent.trim() || '';
    const veg = swapEl.querySelector('span[data-p="veg"]')?.textContent.trim() || '';
    protein = { kott, fisk, veg };
  }

  // data-time finns bara på länderrätter i källan.
  const dataTime = dishEl.getAttribute('data-time');
  const tidBucket = dataTime || TID_BUCKET_OVERRIDE[id];
  if (!tidBucket) {
    console.error(`FEL: ingen tidBucket för rätt "${id}" (${titel}) — varken data-time i källan eller override. Avbryter.`);
    process.exit(1);
  }

  const tidMinuter = harSuffix(minsRaw) ? null : parseLeadingMinutes(minsRaw);

  const slug = asciiFold(titel);

  return {
    id, typ, landSlug, ordning, titel, slug,
    teaser, tidText: minsRaw, tidMinuter, tidBucket,
    ingredienser: ingList, steg, protein, tips,
    imgSrc, crossLink,
  };
}

function byggAltText(ratt) {
  // Riktig, beskrivande alt-text per foto (källan hade alt="" på alla 56) — byggd av
  // rättens namn + en kort, konkret beskrivning hämtad ur teasern, inte en generisk mall.
  const kortTeaser = ratt.teaser.split(/[—–]/)[0].replace(/\.$/, '').trim();
  return `${ratt.titel} — ${kortTeaser}`;
}

function harSuffix(mins) {
  return mins.includes('+');
}
function parseLeadingMinutes(mins) {
  const m = mins.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// ── 5. Basvaror, kryddor, protein, regler ──
function extraheraPlist(ulEl) {
  return Array.from(ulEl.querySelectorAll('li')).map((li) => {
    const namnEl = li.querySelector('.b');
    const namn = namnEl ? Array.from(namnEl.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() : '';
    const tier = li.querySelector('.tier')?.textContent.trim() || null;
    const beskrivning = li.querySelector('.d')?.textContent.trim() || '';
    const kok = li.querySelector('.u')?.textContent.trim() || '';
    const hallbarhet = li.querySelector('.h')?.textContent.trim() || '';
    return { namn, tier, beskrivning, kok, hallbarhet };
  });
}

const basvarorSection = document.querySelector('#basvaror');
const basvarorGrupper = [];
{
  const h3s = Array.from(basvarorSection.querySelectorAll('h3'));
  for (const h3 of h3s) {
    let ul = h3.nextElementSibling;
    if (ul && ul.tagName === 'UL' && ul.classList.contains('plist')) {
      basvarorGrupper.push({ rubrik: h3.textContent.trim(), varor: extraheraPlist(ul) });
    }
  }
}
function extraheraHallbarhetslista(selector) {
  return Array.from(document.querySelectorAll(selector)).map((li) => {
    const yr = li.querySelector('.yr')?.textContent.trim() || '';
    const innerUtanYr = li.innerHTML.replace(/<span class="yr">[^<]*<\/span>/, '');
    const text = htmlTillMarkdownFetstil(innerUtanYr).replace(/\s+/g, ' ').trim();
    return { yr, text };
  });
}
const keepbox = extraheraHallbarhetslista('#basvaror .keepbox li');
const trap = extraheraHallbarhetslista('#basvaror .trap li');
const fresh = Array.from(basvarorSection.querySelectorAll('.fresh p')).map((p) =>
  htmlTillMarkdownFetstil(p.innerHTML).replace(/\s+/g, ' ').trim(),
);

const kryddorSection = document.querySelector('#kryddor');
const kryddorGrupper = [];
{
  const h3s = Array.from(kryddorSection.querySelectorAll('h3'));
  for (const h3 of h3s) {
    let ul = h3.nextElementSibling;
    if (ul && ul.tagName === 'UL' && ul.classList.contains('plist')) {
      kryddorGrupper.push({ rubrik: h3.textContent.trim(), varor: extraheraPlist(ul) });
    }
  }
}

const proteinSection = document.querySelector('#protein');
const proteinRader = Array.from(proteinSection.querySelectorAll('.ptable tbody tr')).map((tr) => {
  const tds = tr.querySelectorAll('td');
  return { kalla: tds[0].textContent.trim(), portion: tds[1].textContent.trim(), protein: tds[2].textContent.trim() };
});
const proteinBuilds = Array.from(proteinSection.querySelectorAll('.build')).map((b) => ({
  namn: b.querySelector('b').textContent.trim(),
  summa: b.querySelector('.sum').textContent.trim(),
  text: b.querySelector('p').textContent.trim(),
}));

const regler = Array.from(document.querySelectorAll('.nk-footer .rules > div')).map((div) => {
  const b = div.querySelector('b');
  const rubrik = b.textContent.trim();
  const text = div.textContent.replace(rubrik, '').trim();
  return { rubrik, text };
});

console.log(`Basvaror: ${basvarorGrupper.reduce((n, g) => n + g.varor.length, 0)} varor i ${basvarorGrupper.length} grupper (+ ${keepbox.length} keepbox, ${trap.length} trap, ${fresh.length} fresh-stycken)`);
console.log(`Kryddor: ${kryddorGrupper.reduce((n, g) => n + g.varor.length, 0)} varor i ${kryddorGrupper.length} grupper`);
console.log(`Protein: ${proteinRader.length} rader, ${proteinBuilds.length} builds`);
console.log(`Regler: ${regler.length}`);

if (basvarorGrupper.reduce((n, g) => n + g.varor.length, 0) !== 25) {
  console.error(`FEL: förväntade 25 basvaror, hittade ${basvarorGrupper.reduce((n, g) => n + g.varor.length, 0)}`);
  process.exit(1);
}
if (kryddorGrupper.reduce((n, g) => n + g.varor.length, 0) !== 11) {
  console.error(`FEL: förväntade 11 kryddor, hittade ${kryddorGrupper.reduce((n, g) => n + g.varor.length, 0)}`);
  process.exit(1);
}
if (proteinRader.length !== 15 || proteinBuilds.length !== 6) {
  console.error(`FEL: förväntade 15 protein-rader + 6 builds, hittade ${proteinRader.length} + ${proteinBuilds.length}`);
  process.exit(1);
}
if (regler.length !== 5) {
  console.error(`FEL: förväntade 5 regler, hittade ${regler.length}`);
  process.exit(1);
}

// Skriv ut hjälpdata som JSON — läses av sidmallarna (pantry/kryddor/protein/regler
// har ingen naturlig "en fil per post"-collection, så vi persisterar dem som
// statisk data i src/data/ istället för hårdkodat i .astro-filer).
mkdirSync(join(ROOT, 'src', 'data'), { recursive: true });
writeFileSync(join(ROOT, 'src', 'data', 'basvaror.json'), JSON.stringify({ grupper: basvarorGrupper, keepbox, trap, fresh }, null, 2));
writeFileSync(join(ROOT, 'src', 'data', 'kryddor.json'), JSON.stringify({ grupper: kryddorGrupper }, null, 2));
writeFileSync(join(ROOT, 'src', 'data', 'protein.json'), JSON.stringify({ rader: proteinRader, builds: proteinBuilds }, null, 2));
writeFileSync(join(ROOT, 'src', 'data', 'regler.json'), JSON.stringify({ regler }, null, 2));

// ── 6. Bilder: slå upp varje Wikimedia Commons-fil, ladda ner, hämta upphovsman+licens ──
const { losBildOchLaddaNer } = await import('./lib/bilder.mjs');

const misslyckadeBilder = [];
let bildIndex = 0;
for (const ratt of ratterRaw) {
  bildIndex++;
  if (bildIndex > 1) await new Promise((r) => setTimeout(r, 700)); // artigt mot Commons API — undvik 429
  try {
    process.stdout.write(`  [${bildIndex}/${ratterRaw.length}] ${ratt.titel}...\r`);
    const bild = await losBildOchLaddaNer({
      src: ratt.imgSrc,
      landSlug: ratt.landSlug,
      rattSlug: ratt.slug,
      root: ROOT,
    });
    bild.alt = byggAltText(ratt);
    delete bild._originalFilnamn;
    ratt.bild = bild;
  } catch (err) {
    misslyckadeBilder.push({ ratt: ratt.titel, id: ratt.id, src: ratt.imgSrc, fel: err.message });
  }
}

if (misslyckadeBilder.length > 0) {
  console.error(`\nFEL: ${misslyckadeBilder.length} bild(er) gick inte att slå upp/ladda ner:`);
  for (const m of misslyckadeBilder) {
    console.error(`  - ${m.ratt} (${m.id}): ${m.src}\n    ${m.fel}`);
  }
  console.error('\nAvbryter utan att skriva några filer — inga bilder tappas tyst.');
  process.exit(1);
}
console.log(`Alla ${ratterRaw.length} bilder uppslagna och nedladdade med upphovsman/licens.`);

// ── 7. Skriv kok/-filer ──
mkdirSync(join(ROOT, 'src', 'content', 'kok'), { recursive: true });
for (const k of kokData) {
  const fm = frontmatterYaml({
    land: k.land,
    slug: k.slug,
    tagline: k.tagline,
    nycklar: k.nycklar,
    why: k.why,
    tema: k.tema,
    morkText: k.morkText,
    dryck: k.dryck,
  });
  const body = byggKokBrodtext(k);
  writeFileSync(join(ROOT, 'src', 'content', 'kok', `${k.slug}.md`), `---\n${fm}\n---\n\n${body}\n`);
}

function byggKokBrodtext(k) {
  // SEO-värdefull, redaktionell brödtext per land — byggd av tagline/nycklar/why,
  // utvecklad till löpande text (inte bara en upprepning av frontmatter-fälten).
  const nyckelLista = k.nycklar.join(', ');
  const adjektiv = ADJEKTIV_PER_SLUG[k.slug];
  const koksats = adjektiv
    ? `Skafferinycklarna för det ${adjektiv} köket är ${nyckelLista}.`
    : `Skafferinycklarna för köken i ${k.land} är ${nyckelLista}.`;
  return [
    `## ${k.land} — ${k.tagline}`,
    '',
    `${k.why}`,
    '',
    `${koksats} Har du de här hemma öppnar du i praktiken hela landets vardagsmat — de flesta av rätterna nedan bygger på samma handfull smaker i olika kombinationer, inte på långa unika inköpslistor per maträtt.`,
    '',
    `Till maten: ${k.dryck.beskrivning}`,
  ].join('\n');
}

// ── 8. Skriv ratter/-filer ──
mkdirSync(join(ROOT, 'src', 'content', 'ratter'), { recursive: true });
for (const r of ratterRaw) {
  const fm = frontmatterYaml({
    titel: r.titel,
    land: r.landSlug,
    typ: r.typ,
    ordning: r.ordning,
    teaser: r.teaser,
    tidText: r.tidText,
    tidMinuter: r.tidMinuter,
    tidBucket: r.tidBucket,
    portioner: null,
    ingredienser: r.ingredienser,
    steg: r.steg,
    protein: r.protein,
    tips: r.tips,
    bild: r.bild,
    crossLink: r.crossLink,
  });
  const filnamn = `${r.landSlug}--${r.slug}.md`;
  writeFileSync(join(ROOT, 'src', 'content', 'ratter', filnamn), `---\n${fm}\n---\n`);
}

console.log(`\nKLART. Skrev ${kokData.length} kök-filer och ${ratterRaw.length} rätt-filer.`);
console.log('Kontrollera src/content/kok/ och src/content/ratter/ samt public/bilder/.');
