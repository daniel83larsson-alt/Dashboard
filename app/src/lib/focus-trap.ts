// Ren logik för fokusfällan i rutor (Web Interface Guidelines: fokus ska stanna
// i en öppen dialog). Tab/Shift+Tab går runt bland rutans knappar och fält i
// stället för att hoppa ut till sidan bakom.
// index = var fokus är nu (-1 = utanför eller på själva rutan), count = antal
// fokuserbara element i rutan. Returnerar vilket element som ska få fokus, eller
// null om webbläsarens vanliga tabbning ska få ske.
export function nextFocusIndex(index: number, count: number, shift: boolean): number | null {
  if (count <= 0) return -1 // inget att fokusera: håll kvar på rutan
  if (index < 0) return shift ? count - 1 : 0 // fokus utanför/på rutan → in i rutan
  if (!shift && index === count - 1) return 0 // sista → första
  if (shift && index === 0) return count - 1 // första → sista
  return null
}
