# Bokforing app

Riktig produktversion av bokföringssiten (efterträder `../bokforing-poc`).
Next.js + Supabase (databas, inloggning, fillagring) + Claude (kvittotolkning).

Ingen kod här har rört ditt Supabase- eller Vercel-konto. Så här kopplar du
ihop dem:

## 1. Databas (Supabase)

1. Öppna ditt Supabase-projekt → **SQL Editor**.
2. Kör hela innehållet i [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql).
   Det skapar alla tabeller, säkerhetsregler (Row Level Security) och
   BAS-kontoplanen.
3. Under **Authentication → Providers** ser du till att e-post/lösenord är
   aktiverat. Vill du testa snabbt utan att bekräfta e-post varje gång:
   **Authentication → Settings → Email → stäng av "Confirm email"** (slå på
   den igen innan riktiga kunder skapar konton).

## 2. Miljövariabler

Kopiera `.env.local.example` till `.env.local` och fyll i:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — finns under
  **Project Settings → API** i Supabase.
- `ANTHROPIC_API_KEY` — din Claude API-nyckel. Krävs för att "Tolka med
  AI"-knappen ska fungera; utan den visas ett tydligt felmeddelande istället
  för en krasch.

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

1. Koppla detta repo (mappen `accounting-app`) till ditt Vercel-projekt som
   root directory.
2. Lägg in samma miljövariabler som i `.env.local`.
3. Koppla din egen domän under **Project Settings → Domains**.

Vercels och Supabase gratisnivåer räcker gott för de första användarna.

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
- AI-tolkning av kvitton sker på servern mot Claude — nyckeln finns aldrig i
  webbläsarkoden.
- SIE4-export av hela räkenskapsåret.

## Vad som medvetet inte är byggt än

- **Revisor-inloggning.** Datamodellen har plats för det (`company_members`
  med roll `revisor`) men det finns inget gränssnitt för att bjuda in någon
  ännu.
- **Bokslut/NE-bilaga.** Bara löpande bokföring + SIE-export idag.
- **Avskrivningar / periodisering** av dyrare inventarier.
- Automatiska backuper är Supabase-projektets ansvar — kontrollera vilken
  plan/backup-policy ditt projekt har innan skarp drift, med tanke på
  7-årskravet i bokföringslagen.

Fråga Riley innan skarp drift med riktiga kunders data — detta är byggt och
typkontrollerat, men **inte** granskat mot en levande Supabase-databas i den
här sessionen (inga riktiga projektnycklar fanns tillgängliga).
