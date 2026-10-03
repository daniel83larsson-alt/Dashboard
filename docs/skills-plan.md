# Plan: så använder vi skills i bygget

Beslutad av Daniel 3 okt 2026 ("lägg till alla och lägg upp en plan"). Skills är
instruktionspaket som Claude följer; de laddas när en session startar. Alla
nedan är **läst före installation** och låsta i `skills-lock.json`.

## Vad vi har och vem som använder det

| Skill | Källa | Gör | Vem / när |
|---|---|---|---|
| `frontend-design` | Anthropic | Tar fram en medveten designriktning (färg, typsnitt, layout) i stället för mallar | **Maya** vid ny sida/skärm, särskilt välkomstsidan |
| `design-taste-frontend`, `minimalist-ui`, `high-end-visual-design`, `redesign-existing-projects` m.fl. | taste-skill (fanns redan) | Fler designspråk att välja mellan | Maya — "två varianter" |
| `animate` | Emil Kowalski | Bygger rörelse i rätt ordning (ska den ens röra sig? kurva, längd, avbrott, reducerad rörelse) | Maya, bara när rörelse tillför något |
| `web-design-guidelines` | Vercel | Granskar UI-kod mot Web Interface Guidelines (tillgänglighet, fokus, formulär, prestanda) → `fil:rad`-lista | **Riley** på ändrade UI-filer; **Maya** före leverans |
| `vercel-react-best-practices` | Vercel | 70 prestandaregler för React/Next.js (vattenfall, buntstorlek, omrenderingar) | **Chris** vid sidor/komponenter; **Sam** vid prestandagenomgång |
| `improve-codebase-architecture` + `codebase-design` | Matt Pocock | Hittar grunda moduler, föreslår "djupare" (rapport + dialog) | **Sam**, vid friktion eller kvartalsvis |
| `code-review-two-axis` | Matt Pocock | Granskar ändringar mot (1) kodstandard och (2) kravtext, var för sig | **Riley** innan något anses klart; kravtext = vår `STATUS.md`-rad |
| `seo-audit` | Corey Haines | Teknisk + on-page SEO-granskning | **Viktor/Nova** på dltrainer.se när välkomstsidan är ny |
| `find-skills` | Vercel | Söker fler skills | Alex, bara på Daniels begäran |

Inbyggda sedan tidigare: `code-review` (fel/buggar), `security-review`, `simplify`.
Våra egna rutinböcker: `verify-change`, `live-check`, `schedule-change`, `recap-prompt-change`.

## Arbetsflöde

1. **Ny skärm eller sida (Maya):** `frontend-design` → designplan (4–6 färger, typsnitt, layout) → bygg **två varianter** → riktiga skärmdumpar → `web-design-guidelines` → välj med Daniel. `animate` bara för moment som motiverar rörelse.
2. **Byggande (Chris):** `vercel-react-best-practices` på varje ändring som rör en sida eller stor klientkomponent (databasfrågor parallella, inget onödigt klientkod, inga `transition: all`). Därefter `verify-change`.
3. **Granskning före "klart" (Riley):** `web-design-guidelines` på ändrade UI-filer, `code-review-two-axis` mot grenens commits (kravtext: STATUS.md), `security-review` vid auth/data/nycklar.
4. **Arkitektur (Sam):** `improve-codebase-architecture` när något känns segt att ändra, annars en gång per kvartal. Första kandidaterna: `FoodLogClient.tsx` (~1 900 rader), `ProfileForm.tsx` (~1 150), `ViktmalClient.tsx` (~1 050), `dashboard/page.tsx`.
5. **Välkomstsida + SEO (Maya, Viktor, Nova):** version 2 med `frontend-design` + taste-skills, sedan `seo-audit` mot `dltrainer.se` (obs: schema/JSON-LD syns bara i renderad sida — använd Playwright, inte bara hämtning).

## Regler

- Inga nya skills utan Daniels uttryckliga ja **och** att innehållet läses först (skills körs med full behörighet och styr framtida sessioner).
- Skills som hämtar instruktioner utifrån vid körning installeras inte (se nedan).
- Ändrade skills: `npx skills update` skriver över våra ändringar — läs diffen först.

## Granskning vid installation (3 okt)

- **Installerade och lästa:** alla ovan. Reglerfilerna i `vercel-react-best-practices` (70 st) är mönsterskannade, inte läst en och en.
- **Ändrad: `web-design-guidelines`.** Originalet hämtade reglerna från internet vid varje körning (ändrad text hos upstream = ändrat beteende utan att vi ser det). Nu använder den en granskad lokal kopia (`guidelines.md`). Engelska skrivregler (Title Case) gäller inte vår svenska text.
- **Ändrad: `code-review` → `code-review-two-axis`.** Mappnamnet styr skillens namn och krockade med den inbyggda `code-review`.
- **Inte installerad: `agent-browser`.** Skillen är bara en stub som säger åt agenten att hämta de riktiga instruktionerna från ett CLI (`agent-browser skills get core`) som inte ligger i repot — innehållet går alltså inte att läsa i förväg. Dessutom förhandsgodkänner den kommandon, kräver global npm-installation och nämner Slack, Electron och AWS. Vi har redan Playwright med förinstallerad Chromium för riktiga webbläsartester.
- **Väntar:** `ui-ux-pro-max`, `impeccable` (okänd upphovsperson, ej kontrollerade).
- **Saknade syskonskills** som några av de installerade pekar på (`grilling`, `domain-modeling`, `pick-ui-library`, `review-animations`, `improve-animations`) är inte installerade; skillsen fungerar utan dem men utan just de stegen.

## Första genomgången (3 okt) — gjort

Mätt mot Web Interface Guidelines över hela appen:

| Fynd | Före | Åtgärd |
|---|---|---|
| Respekterar inte "minska rörelse" | 0 av 53 filer med animationer | Global regel i `globals.css` |
| `transition: all` / `transition-all` | 7 framstegsfält | `transition-[width]` |
| Rutor utan dialogroll och Esc | 5 rutor (Logga mat, Redigera post, Dagens måltider, Snabbval, Vanor) | `role="dialog" aria-modal`, `aria-label`, Esc stänger (`lib/use-escape-key.ts`) |
| Ikonknappar utan `aria-label`, `<div onClick>`-knappar, `user-scalable=no` | 0 / bara bakgrundsstängning i rutor / 0 | Inget att göra |

## Kvar att göra (prioritetsordning)

1. **Fokusfälla i rutorna** (tab ska stanna i rutan, fokus tillbaka till knappen när den stängs) — gemensam komponent för alla fem.
2. **Prestanda med `vercel-react-best-practices`:** gå igenom `dashboard/page.tsx`, `viktmal/page.tsx`, `mat/page.tsx` (databasfrågor parallella redan; kontrollera klientbunt och vad som skickas till klienten) och mät med verklig laddtid.
3. **Dela upp `FoodLogClient.tsx`** (1 900 rader) — kandidat nummer ett för `improve-codebase-architecture`.
4. **Välkomstsida v2** med två varianter (Maya) + `seo-audit`.


## Tillägg 2026-10-03 — luckor stängda

Genomgång av vilka områden som saknade skill. Alla externa granskades (läst igenom, inga dolda kommandon; `supabase` hämtar dokumentation från supabase.com vid körning — behandlas som data) innan installation:

| Område | Skill | Källa | Används av |
|---|---|---|---|
| Databas, RLS, Supabase-säkerhet | `supabase`, `supabase-postgres-best-practices` | supabase/agent-skills (officiell) | Riley, Chris, Sam |
| Webbläsartester | `webapp-testing` | anthropics/skills (officiell) | Riley, Maya |
| Säljande text | `copywriting`, `cro` | coreyhaines31/marketingskills | Viktor, Nova, Maya |
| Integritet/GDPR för hälsodata | `halsodata-integritet` | egen (ingen bra extern hittades) | Riley, Sam |
| PWA | — ingen PWA-specifik skill finns; `web-design-guidelines` täcker mobilgranskningen | | Maya |
