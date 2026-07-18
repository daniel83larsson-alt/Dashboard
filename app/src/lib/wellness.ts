// Garmin returns hrvStatus as a raw upper-case English enum
// (BALANCED/UNBALANCED/LOW/POOR/...); translate the known values and fall
// back to a readable version of whatever Garmin sends next instead of
// leaking raw English or crashing on an unrecognized value.
const HRV_STATUS_LABELS: Record<string, string> = {
  BALANCED: 'Balanserad',
  UNBALANCED: 'Obalanserad',
  LOW: 'Låg',
  POOR: 'Dålig',
  UNKNOWN: 'Okänd',
}

export function hrvStatusLabel(status: string): string {
  return HRV_STATUS_LABELS[status.toUpperCase()] ?? status.toLowerCase().replace(/_/g, ' ')
}
