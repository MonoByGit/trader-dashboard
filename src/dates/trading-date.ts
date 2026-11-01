/** Normalize user/DB inputs to YYYY-MM-DD for Alpaca API calls. */
export function toTradingDateString(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`Ongeldige datum: ${value}`);
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const iso = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1]!;
    throw new Error(`Ongeldige datum: ${trimmed}`);
  }
  throw new Error(`Ongeldige datum: ${String(value)}`);
}
