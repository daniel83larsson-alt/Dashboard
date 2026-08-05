#!/usr/bin/env node
// Efterbyggnadskontroll — går igenom dist/ och kontrollerar att allt som uppdraget
// kräver faktiskt är sant, inte bara "borde fungera". Avslutar med icke-noll
// exitkod om något fel hittas.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');

let fel = [];
let varningar = [];

function samlaHtmlFiler(dir) {
  const resultat = [];
  for (const namn of readdirSync(dir)) {
    const full = join(dir, namn);
    const st = statSync(full);
    if (st.isDirectory()) resultat.push(...samlaHtmlFiler(full));
    else if (namn.endsWith('.html')) resultat.push(full);
  }
  return resultat;
}

if (!existsSync(DIST)) {
  console.error('FEL: dist/ finns inte — kör `npm run build` först.');
  process.exit(1);
}

const alla = samlaHtmlFiler(DIST);
console.log(`Hittade ${alla.length} HTML-sidor i dist/.`);

// ── 1. Totalt sidantal ──
// 56 receptsidor + 18 kökssidor + 12 övriga sidor (hem, basvaror, brod, kebab,
// protein, regler, om, inkopslista, kontakt, cookies, integritetspolicy, + astro
// genererar ev. en 404 om sådan finns) = 86 (utan 404).
const FORVANTAT_ANTAL = 86;
if (alla.length !== FORVANTAT_ANTAL) {
  fel.push(`Sidantal: förväntade ${FORVANTAT_ANTAL}, hittade ${alla.length}.`);
} else {
  console.log(`OK: sidantal = ${FORVANTAT_ANTAL}.`);
}

// ── 2. Receptsidor: JSON-LD Recipe måste finnas, parsa och innehålla rätt fält,
//     och INTE innehålla de förbjudna fälten. ──
const receptSidor = alla.filter((f) => {
  const rel = f.replace(DIST + '/', '');
  const delar = rel.split('/');
  // /<land>/<ratt>/index.html — tre delar (land, ratt, index.html), och <land> är
  // inte en av de reserverade toppnivå-rutterna.
  const RESERVERADE = new Set(['kryddor', 'basvaror', 'brod', 'kebab', 'protein', 'regler', 'om', 'inkopslista', 'kontakt', 'cookies', 'integritetspolicy']);
  return delar.length === 3 && delar[2] === 'index.html' && !RESERVERADE.has(delar[0]);
});
console.log(`Hittade ${receptSidor.length} receptsidor (förväntat 56).`);
if (receptSidor.length !== 56) {
  fel.push(`Receptsidor: förväntade 56, hittade ${receptSidor.length}.`);
}

const KRAVDA_RECIPE_FALT = [
  'name', 'description', 'image', 'recipeIngredient', 'recipeInstructions',
  'recipeCuisine', 'keywords', 'recipeCategory', 'inLanguage', 'author',
  'datePublished', 'dateModified',
];
const FORBJUDNA_RECIPE_FALT = ['recipeYield', 'prepTime', 'cookTime', 'nutrition', 'aggregateRating', 'review'];

let receptMedJsonLd = 0;
for (const fil of receptSidor) {
  const html = readFileSync(fil, 'utf-8');
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  if (!match) {
    fel.push(`${fil.replace(DIST, '')}: inget <script type="application/ld+json">-block hittades.`);
    continue;
  }
  let recipeJson = null;
  for (const block of match) {
    const inner = block.replace(/^<script type="application\/ld\+json">/, '').replace(/<\/script>$/, '');
    let parsed;
    try {
      parsed = JSON.parse(inner);
    } catch (e) {
      fel.push(`${fil.replace(DIST, '')}: ett JSON-LD-block gick inte att JSON.parse:a (${e.message}).`);
      continue;
    }
    if (parsed['@type'] === 'Recipe') recipeJson = parsed;
  }
  if (!recipeJson) {
    fel.push(`${fil.replace(DIST, '')}: inget JSON-LD-block med @type "Recipe" hittades.`);
    continue;
  }
  receptMedJsonLd++;
  for (const faltNamn of KRAVDA_RECIPE_FALT) {
    if (!(faltNamn in recipeJson) || recipeJson[faltNamn] === undefined) {
      fel.push(`${fil.replace(DIST, '')}: Recipe JSON-LD saknar obligatoriskt fält "${faltNamn}".`);
    }
  }
  for (const faltNamn of FORBJUDNA_RECIPE_FALT) {
    if (faltNamn in recipeJson) {
      fel.push(`${fil.replace(DIST, '')}: Recipe JSON-LD innehåller förbjudet fält "${faltNamn}" (värde: ${JSON.stringify(recipeJson[faltNamn])}).`);
    }
  }
  // totalTime är tillåtet men villkorat — om det finns ska det vara PT-format.
  if ('totalTime' in recipeJson && !/^PT\d+M$/.test(recipeJson.totalTime)) {
    fel.push(`${fil.replace(DIST, '')}: totalTime "${recipeJson.totalTime}" är inte giltigt PT-format.`);
  }
}
console.log(`${receptMedJsonLd}/${receptSidor.length} receptsidor har giltig Recipe JSON-LD.`);

// ── 3. Bilder: alla 56 recept ska ha en bild på disk + riktiga upphovsman/licens-värden
//     i frontmatter (kollar content-källfilerna, inte bara HTML-outputen). ──
const { readFileSync: rf } = await import('node:fs');
const contentDir = join(ROOT, 'src', 'content', 'ratter');
const contentFiler = existsSync(contentDir) ? readdirSync(contentDir).filter((f) => f.endsWith('.md')) : [];
if (contentFiler.length !== 56) {
  fel.push(`Content-källfiler: förväntade 56 .md-filer i src/content/ratter/, hittade ${contentFiler.length}.`);
}
let bilderOk = 0;
for (const filnamn of contentFiler) {
  const raw = rf(join(contentDir, filnamn), 'utf-8');
  const filMatch = raw.match(/fil:\s*"([^"]+)"/);
  const altMatch = raw.match(/alt:\s*"([^"]*)"/);
  const upphovsmanMatch = raw.match(/upphovsman:\s*"([^"]*)"/);
  const licensMatch = raw.match(/licens:\s*"([^"]*)"/);
  const problem = [];
  if (!filMatch || !filMatch[1]) problem.push('bild.fil saknas');
  else {
    const bildPath = join(ROOT, 'public', filMatch[1]);
    if (!existsSync(bildPath)) problem.push(`bilden finns inte på disk: public${filMatch[1]}`);
  }
  if (!altMatch || !altMatch[1] || altMatch[1].trim() === '') problem.push('bild.alt är tom');
  if (!upphovsmanMatch || !upphovsmanMatch[1] || upphovsmanMatch[1].trim() === '') problem.push('bild.upphovsman är tom');
  if (!licensMatch || !licensMatch[1] || licensMatch[1].trim() === '') problem.push('bild.licens är tom');
  if (problem.length) {
    fel.push(`${filnamn}: ${problem.join('; ')}`);
  } else {
    bilderOk++;
  }
}
console.log(`${bilderOk}/${contentFiler.length} recept har bild + fullständig attribution.`);

// ── 4. Reserverade rutter kolliderar inte med köks-sluggar ──
const kokDir = join(ROOT, 'src', 'content', 'kok');
const kokFiler = existsSync(kokDir) ? readdirSync(kokDir).filter((f) => f.endsWith('.md')) : [];
const RESERVERADE_SLUGS = new Set(['kryddor', 'basvaror', 'brod', 'kebab', 'protein', 'regler', 'om', 'inkopslista', 'kontakt', 'cookies', 'integritetspolicy']);
for (const filnamn of kokFiler) {
  const slug = filnamn.replace(/\.md$/, '');
  if (RESERVERADE_SLUGS.has(slug)) {
    fel.push(`Köks-slug "${slug}" krockar med en reserverad rutt.`);
  }
}
if (kokFiler.length !== 18) {
  fel.push(`Kök-källfiler: förväntade 18, hittade ${kokFiler.length}.`);
}

// ── 5. sitemap + robots ──
if (!existsSync(join(DIST, 'sitemap-index.xml'))) {
  varningar.push('sitemap-index.xml saknas i dist/.');
}
if (!existsSync(join(DIST, 'robots.txt'))) {
  varningar.push('robots.txt saknas i dist/ (@astrojs/sitemap genererar bara sitemap, inte robots.txt automatiskt — se rapport).');
}

// ── Sammanfattning ──
console.log('\n──────────── SAMMANFATTNING ────────────');
if (varningar.length) {
  console.log(`${varningar.length} varning(ar):`);
  for (const v of varningar) console.log(`  ⚠ ${v}`);
}
if (fel.length) {
  console.log(`\n${fel.length} FEL:`);
  for (const f of fel) console.log(`  ✗ ${f}`);
  console.log('\nVERIFIERING MISSLYCKADES.');
  process.exit(1);
} else {
  console.log('Inga fel. Verifiering godkänd.');
  process.exit(0);
}
