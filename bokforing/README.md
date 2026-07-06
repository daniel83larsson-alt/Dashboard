# Bokforing

Riktig produktversion av bokföringssiten (efterträder `../bokforing-poc`).
Byggd enligt samma mönster som `../app` (DL Trainer) och `../hemkoll`:
Next.js App Router + TypeScript + Tailwind v4 + Supabase (auth, databas,
fillagring), Gemini som standard-AI, inget gemensamt paket mellan apparna —
egen `package.json` och `node_modules` i den här mappen.

Ingen kod här har rört ditt Supabase- eller Vercel-konto. Så här kopplar du
ihop dem:

## 1. Databas (Supabase)

1. Öppna ditt Supabase-projekt → **SQL Editor**.
2. Kör hela innehållet i [`supabase/schema.sql`](./supabase/schema.sql).
   Det skapar alla tabeller, säkerhetsregler (Row Level Security) och
   BAS-kontoplanen. Lägg framtida ändringar till i samma fil och kör bara
   de nya raderna manuellt — samma mönster som de andra apparna, ingen
   migrationshistorik.
3. Under **Authentication → Providers** ser du till att e-post/lösenord är
   aktiverat. Vill du testa snabbt utan att bekräfta e-post varje gång:
   **Authentication → Settings → Email → stäng av "Confirm email"** (slå på
   den igen innan riktiga kunder skapar konton).

## 2. Miljövariabler

Kopiera `.env.local.example` till `.env.local` och fyll i:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — finns under
  **Project Settings → API** i Supabase.
- `GEMINI_API_KEY` — samma Gemini-nyckel/betalning som DL Trainer använder.
  Krävs för att "Tolka med AI"-knappen ska fungera; utan den visas ett
  tydligt felmeddelande istället för en krasch.
- `ADMIN_EMAIL` — ska matcha e-postadressen hårdkodad i `is_admin()` i
  `schema.sql` (`daniel83larsson@gmail.com`).

Sätt samma variabler i Vercel under **Project Settings → Environment
Variables** när du deployer (steg 4).

## 3. Kör lokalt

```bash
npm install
npm run dev
```

Öppna http://localhost:3000 — du landar på inloggningen, skapar ett konto,
och skapar ditt företag i onboarding-steget.

## 4. Deploy (Vercel)

1. Skapa ett nytt Vercel-projekt kopplat till samma GitHub-repo/team, med
   **rootDirectory** satt till `bokforing` — så att push till branchen
   deployer automatiskt (samma mönster som `app/`, till skillnad från
   `hemkoll/`:s manuella CLI-deploy).
2. Lägg in samma miljövariabler som i `.env.local`.
3. Koppla din egen domän under **Project Settings → Domains**.

Vercels och Supabase gratisnivåer räcker gott för de första användarna.

## Skillnader mot POC:n / arkitekturbeslut

- **Auth-mönster:** ingen middleware/proxy. Varje sida som kräver inloggning
  gör sin egen `await supabase.auth.getUser()` och redirectar till `/login`
  om ingen användare finns (`lib/company.ts` + `app/(app)/layout.tsx`) —
  samma mönster som de andra apparna i repot.
- **RLS:** varje tabell har `user_id`/`company_id`-baserad
  Row Level Security plus en hårdkodad admin-policy (`is_admin()` i
  `schema.sql`) som ger `daniel83larsson@gmail.com` läsåtkomst till allt,
  samma mönster som de andra apparna.
- **AI:** Gemini 2.5 Flash via REST (`lib/ai-receipt.ts`, ingen SDK) är
  standardmotorn. Ett "ta med egen Anthropic-nyckel"-läge (som DL Trainers
  coach/insikter) är inte byggt än — `lib/ai-receipt.ts` är den enda platsen
  som skulle behöva grenas för det.

## Vad som redan är byggt

- Riktig inloggning (Supabase Auth), en användare kan bara se sitt eget
  företags data (Row Level Security i databasen, inte bara i appkoden).
- Riktig dubbel bokföring: varje verifikat balanserar (debet = kredit),
  kontrolleras av databasen, inte bara av frontend-koden.
- Momsen delas automatiskt upp mot rätt konton (2611/2641) istället för att
  bokföras som en klumpsumma.
- Löpande verifikationsnummer per räkenskapsår, utan luckor.
- Bokförda verifikat går inte att radera eller ändra — en felaktig post
  rättas med en ny motbokning ("Rätta"-knappen), originalet finns kvar.
- Kvitton lagras i privat fillagring (Supabase Storage), aldrig i databasen
  som text.
- AI-tolkning av kvitton sker på servern mot Gemini — nyckeln finns aldrig i
  webbläsarkoden.
- SIE4-export av hela räkenskapsåret.

## Vad som medvetet inte är byggt än

- **Revisor-inloggning** (dela en företags bokföring med en till användare).
  Kräver en ny kopplingstabell i `schema.sql` när det blir aktuellt — inte
  byggd nu för att hålla ägarskapsmodellen lika enkel som de andra apparna.
- **Bring your own Anthropic key**, för den som vill köra Claude istället
  för Gemini på kvittotolkningen.
- **Bokslut/NE-bilaga.** Bara löpande bokföring + SIE-export idag.
- **Avskrivningar / periodisering** av dyrare inventarier.
- Automatiska backuper är Supabase-projektets ansvar — kontrollera vilken
  plan/backup-policy ditt projekt har innan skarp drift, med tanke på
  7-årskravet i bokföringslagen.

Fråga Riley innan skarp drift med riktiga kunders data — detta är byggt och
typkontrollerat, men **inte** granskat mot en levande Supabase-databas i den
här sessionen (inga riktiga projektnycklar fanns tillgängliga).
