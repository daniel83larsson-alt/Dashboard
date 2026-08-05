import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Slugs reserved by non-cuisine routes — a cuisine can never collide with these.
export const RESERVERADE_SLUGS = [
  'kryddor',
  'basvaror',
  'brod',
  'kebab',
  'protein',
  'regler',
  'om',
  'inkopslista',
  'kontakt',
  'cookies',
  'integritetspolicy',
] as const;

const bildSchema = z.object({
  fil: z.string().min(1, 'bild.fil får inte vara tomt'),
  alt: z.string().min(4, 'bild.alt måste vara riktig alt-text, inte tom/generisk'),
  kalla: z.string().url(),
  upphovsman: z.string().min(1, 'upphovsman måste anges — får aldrig hittas på'),
  licens: z.string().min(1, 'licens måste anges — får aldrig hittas på'),
});

const kok = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/kok' }),
  schema: z.object({
    land: z.string().min(1),
    slug: z
      .string()
      .min(1)
      .refine((s) => !(RESERVERADE_SLUGS as readonly string[]).includes(s), {
        message: 'Slug krockar med en reserverad rutt (kryddor/basvaror/brod/kebab/protein/regler/om/inkopslista/kontakt/cookies/integritetspolicy)',
      }),
    tagline: z.string().min(1), // ursprungets "flag"-rad, t.ex. "Andalusien · röken"
    nycklar: z.array(z.string().min(1)).min(3).max(6),
    why: z.string().min(1),
    tema: z.string().min(2).max(2), // matchar --es/--it/... CSS-variabler i global.css
    morkText: z.boolean().default(false), // sant för in/wa där texten ska vara mörk mot ljus bakgrund
    dryck: z.object({
      namn: z.string().min(1),
      beskrivning: z.string().min(1),
      url: z.string().url(),
    }),
  }),
});

const ratter = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/ratter' }),
  schema: z.object({
    titel: z.string().min(1),
    land: reference('kok'),
    typ: z.enum(['ratt', 'brod', 'kebab']),
    ordning: z.number().int().nonnegative(),
    teaser: z.string().min(1),
    tidText: z.string().min(1),
    tidMinuter: z.number().int().positive().nullable(),
    tidBucket: z.enum(['snabb', 'medel', 'langsam', 'middag']),
    portioner: z.number().int().positive().nullable(),
    ingredienser: z
      .array(
        z.object({
          namn: z.string().min(1),
          mangd: z.string(), // kan vara tomt (t.ex. "efter smak" saknas ibland helt)
        }),
      )
      .min(1),
    steg: z.array(z.string().min(1)).min(1),
    protein: z
      .object({
        kott: z.string().min(1),
        fisk: z.string().min(1),
        veg: z.string().min(1),
      })
      .nullable(),
    tips: z.string().min(1),
    bild: bildSchema,
    crossLink: z
      .object({
        land: reference('kok'),
        notis: z.string(),
      })
      .nullable()
      .default(null),
  }),
});

export const collections = { kok, ratter };
