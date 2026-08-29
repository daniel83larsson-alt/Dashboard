import { Yazio } from 'yazio'

// YAZIO has no official public API. This wraps the `yazio` npm package,
// which reverse-engineers the same backend (https://yzapi.yazio.com/v15)
// the YAZIO mobile app itself talks to — same category of integration as
// Garmin's (lib/garmin.ts), same caveat: unofficial, can break if YAZIO
// changes their backend, and technically outside their terms of service
// even for a user's own account.
//
// Real, verified (not guessed) response shapes, confirmed by reading the
// installed package's own .d.ts files rather than trusting its still-thin
// README:
//   - user.getDailySummary({ date }) → already-aggregated totals per meal
//     slot (breakfast/lunch/dinner/snack), each with
//     { "energy.energy", "nutrient.carb", "nutrient.fat", "nutrient.protein" },
//     PLUS a `units` object (unit_energy etc.) that says whether energy is
//     reported in kcal or kJ for this account — read that instead of
//     assuming, YAZIO lets each user pick their own unit.
//   - user.getConsumedItems({ date }) → only product_id references per
//     logged item, not the product's name/nutrients — those need a
//     separate products.get(id) call per item. Two of its three result
//     buckets (recipe_portions, simple_products) aren't even typed by the
//     library yet ("unknown"), so this is kept around for inspection but
//     NOT relied on for the first pass.

export type YazioCredentials = { email: string; password: string }

function client(email: string, password: string): Yazio {
  return new Yazio({ credentials: { username: email, password } })
}

// Cheap, low-cost endpoint used purely to verify a login actually works
// before we save it — same "verify credentials work before saving" rule
// the Garmin connect route follows.
export async function verifyYazioCredentials(email: string, password: string): Promise<void> {
  await client(email, password).user.get()
}

export async function fetchYazioDailySummary(email: string, password: string, date: Date = new Date()) {
  try {
    return await client(email, password).user.getDailySummary({ date })
  } catch {
    return null
  }
}

export async function fetchYazioConsumedItems(email: string, password: string, date: Date = new Date()) {
  try {
    return await client(email, password).user.getConsumedItems({ date })
  } catch {
    return null
  }
}
