# STATUS — Bokföringssite för enskild firma

Ägs av Alex. Varje önskemål/fråga från Daniel läggs till här innan arbete påbörjas. ✅ sätts först när det är verifierat mot systemet, inte bara "borde fungera".

## Aktiva/klara punkter

- [x] **CLAUDE.md uppdaterad till hela teamet** (Nova, Viktor, Robin, Noa tillagda) — verifierat: fil skriven till repo-roten, innehåll matchar Daniels uppladdade fil.
- [x] **Scope för bokföringssiten klargjort** — målgrupp: enskild firma (Sverige). Kvittoflöde: AI-tolkning (OCR + Claude), simulerad i POC. Revisor-underlag: SIE-fil (svensk standard).
- [x] **POC byggd** (`bokforing-poc/index.html`) — Maya. Inloggning (simulerad), kontoplan (förenklad BAS), kvittouppladdning → simulerad AI-tolkning → bokföring, transaktionslista, kontosaldon, SIE-export, revisor-godkännande-status. Data sparas i localStorage (POC-begränsning, tydligt kommunicerad i UI).
- [x] **Verifiera POC i webbläsare** — automatiserat via Playwright-loop (Noa/Robin), stoppvillkor: skapa användare → mata in konto → ladda upp fake kvitto → AI-tolka → bokför → data överlever reload → generera SIE-fil. Alla 5 steg godkända på första riktiga körningen.
- [x] **Daniels validering av POC** — godkänd ("ser väldigt snyggt ut"), vill nu gå vidare mot riktig produkt.
- [x] **Loop-beslut (Noa)** — kört: engångs-verifieringsloop mot bokforing-poc/index.html, körd lokalt i scratchpad, ingen bugg hittad i appen.
- [x] **Mobil-bugg i publicerad Artifact** — localStorage kraschade tyst i sandboxad iframe. Fixat med try/catch-fallback (in-memory-läge + tydlig UI-text). Verifierat om via Playwright-loopen, republicerat, källkod dubbelkollad via WebFetch.
- [x] **Ekonom-genomgång av POC:n** — gap-lista levererad: saknar moms-uppdelning, korrekt motpostlogik, löpnummer på verifikat, rättelseposter istället för radering, 7-års arkivering, NE-bilaga/bokslutsunderlag. De tre första ska lösas innan skarp drift (Daniels beslut).
- [x] **Arkitektur (Sam)** — godkänd av Daniel: Next.js + Supabase (databas/auth/fillagring) + Claude (kvittotolkning), hosting Vercel, riktig egen domän. Daniel har redan Supabase/Vercel-konton — inget skapades/rördes i dem, bara kod som han kopplar in själv.
- [x] **Produkt (Chris) — första versionen byggd** (`accounting-app/`): riktig inloggning (Supabase Auth), Row Level Security så en användare fysiskt inte kan nå en annans data, äkta dubbel bokföring (databasen vägrar obalanserade verifikat), automatisk momsuppdelning, löpande verifikationsnummer utan luckor, rättelseposter istället för radering, kvitton i privat fillagring, AI-tolkning körs server-side (nyckel aldrig i webbläsaren), SIE4-export.
  **Verifierat:** `tsc --noEmit` rent, `next build` grön, `eslint` rent, produktionsserver smoke-testad lokalt (oautentiserad request till `/` omdirigerar korrekt till `/login`, `/login` renderar). **Inte verifierat:** mot en riktig Supabase-databas — inga levande projektnycklar fanns i den här sessionen. Körbarheten mot skarp data återstår att bekräfta när Daniel kopplat in sina egna nycklar (se `accounting-app/README.md`).
- [ ] **Säkerhet (Riley)** — Riley bör granska RLS-policyerna och auth-flödet mot en riktig Supabase-instans innan skarp drift.
- [ ] **Deploy (Jordan)** — väntar på att Daniel kopplar in sina Supabase/Vercel-nycklar enligt README:n.
- [ ] **Kvarstår innan lansering (från ekonom-genomgången):** bokslut/NE-bilaga, avskrivningar, revisor-inloggning (datamodellen har plats men inget UI ännu).
- [ ] **Affärsmodell/pricing (Nova)** och **sälj/landningssida (Viktor)** — ej diskuterat än.
