// Löser en Wikimedia Commons "Special:FilePath"-hotlink tillbaka till dess File:-sida,
// hämtar äkta upphovsman + licens ur Commons API, och laddar ner bilden till
// public/bilder/<land>/<slug>.<ext> — självhostat, ingen hotlinkning kvar.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const UA = 'KoketsNycklarMigrering/1.0 (https://koket-nycklar.vercel.app; kontakt via repo-agare) node-fetch';

function filnamnFranSpecialFilePath(src) {
  // https://commons.wikimedia.org/wiki/Special:FilePath/Focaccia%20Bread.jpg?width=900
  const url = new URL(src);
  const del = url.pathname.split('/Special:FilePath/')[1];
  if (!del) throw new Error(`Kunde inte tolka Special:FilePath-URL: ${src}`);
  return decodeURIComponent(del);
}

function strippaHtml(s) {
  if (!s) return '';
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function hamtaMedRetry(url, opts, forsok = 6) {
  let sistaFel;
  for (let i = 0; i < forsok; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || 0;
        const vantaMs = Math.max(retryAfter * 1000, 1500 * (i + 1));
        await new Promise((r) => setTimeout(r, vantaMs));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return res;
    } catch (err) {
      sistaFel = err;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw sistaFel || new Error('Gav upp efter upprepade 429 Too Many Requests');
}

export async function losBildOchLaddaNer({ src, landSlug, rattSlug, root }) {
  const filnamn = filnamnFranSpecialFilePath(src);
  const titelParam = `File:${filnamn}`;

  const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(titelParam)}&prop=imageinfo&iiprop=url|extmetadata|mime&format=json&origin=*`;
  const res = await hamtaMedRetry(apiUrl, { headers: { 'User-Agent': UA } });
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) throw new Error('Inget svar från Commons API (query.pages saknas)');
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined) {
    throw new Error(`Filen hittades inte på Wikimedia Commons: ${titelParam}`);
  }
  const info = page.imageinfo?.[0];
  if (!info) throw new Error(`Ingen imageinfo för ${titelParam}`);

  const meta = info.extmetadata || {};
  const artistRaw = meta.Artist?.value;
  const creditRaw = meta.Credit?.value;
  let upphovsman = strippaHtml(artistRaw) || strippaHtml(creditRaw);
  if (!upphovsman) {
    throw new Error(`Ingen upphovsman (Artist/Credit) i Commons-metadata för ${titelParam} — kan inte attribuera lagligt korrekt.`);
  }
  const licens = meta.LicenseShortName?.value || meta.UsageTerms?.value;
  if (!licens) {
    throw new Error(`Ingen licens (LicenseShortName/UsageTerms) i Commons-metadata för ${titelParam}.`);
  }

  const imgUrl = info.url;
  const imgRes = await hamtaMedRetry(imgUrl, { headers: { 'User-Agent': UA } });
  const originalBuf = Buffer.from(await imgRes.arrayBuffer());

  // Wikimedia Commons-original är ofta 3000px+/flera MB rakt av (upp mot 20+ MB
  // per bild sett i den här migreringen) — helt fel för en receptbild på webben.
  // Skalar ner till max 1600px bredd och komprimerar till jpeg — fortfarande gott
  // om kvalitet för en hero-bild, men en bråkdel av storleken. Bilden bor
  // fortfarande självhostad i public/bilder/, bara inte i originalupplösning.
  const optimeradBuf = await sharp(originalBuf)
    .rotate() // respektera EXIF-orientering innan vi kastar metadatan
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();

  const ext = 'jpg';
  const dir = join(root, 'public', 'bilder', landSlug);
  mkdirSync(dir, { recursive: true });
  const filPath = join(dir, `${rattSlug}.${ext}`);
  writeFileSync(filPath, optimeradBuf);

  return {
    fil: `/bilder/${landSlug}/${rattSlug}.${ext}`,
    alt: '', // fylls i av anroparen (kräver rättens titel/teaser, som bilder.mjs inte känner till)
    kalla: `https://commons.wikimedia.org/wiki/${encodeURIComponent(titelParam).replace(/%3A/g, ':')}`,
    upphovsman,
    licens,
    _originalFilnamn: filnamn,
  };
}
