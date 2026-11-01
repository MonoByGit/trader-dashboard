/**
 * Of de laatste beschikbare dagbar af is voor besluiten op de close:
 * eerdere sessiedatum, of vandaag terwijl de markt dicht is.
 */
export function isDailyBarComplete(input: {
  lastBarSessionDate: string;
  sessionToday: string;
  marketOpen?: boolean;
}): boolean {
  const { lastBarSessionDate, sessionToday, marketOpen } = input;
  if (lastBarSessionDate < sessionToday) return true;
  if (lastBarSessionDate > sessionToday) return false;
  return marketOpen === false;
}
