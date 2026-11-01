import { AlpacaHttpError } from './alpaca-http-error.js';

/** Read HTTP status from Alpaca client errors (typed first, regex fallback). */
export function alpacaHttpStatusFromError(error: unknown): number | null {
  if (error instanceof AlpacaHttpError) return error.status;
  const m = String(error).match(/Alpaca (?:(?:GET|POST|DELETE) )?\S+: (\d{3})\b/);
  return m ? Number.parseInt(m[1], 10) : null;
}

export { AlpacaHttpError };
