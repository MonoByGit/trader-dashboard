/** Parse Alpaca client errors like `Alpaca DELETE url: 422 body`. */
export function alpacaHttpStatusFromError(error: unknown): number | null {
  const m = String(error).match(/Alpaca (?:GET|POST|DELETE) [^:]+: (\d{3})\b/);
  return m ? Number.parseInt(m[1], 10) : null;
}
