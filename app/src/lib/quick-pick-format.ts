// Daniel: "se hur mycket protein det är i varje" snabbval. Raden visar samma
// portion som kcal-talet (senast loggade mängd). Protein kan saknas (inte varje
// databasprodukt eller AI-uppskattning ger ett värde) — då skriver vi det
// öppet i stället för att visa 0 g, som skulle se ut som ett riktigt värde.
export function quickPickMacroText(p: { calories: number; protein_g: number | null }): { kcal: string; protein: string; proteinKnown: boolean } {
  const known = p.protein_g != null && Number.isFinite(p.protein_g)
  return {
    kcal: `${p.calories} kcal`,
    protein: known ? `${Math.round(p.protein_g as number)} g protein` : 'protein saknas',
    proteinKnown: known,
  }
}
