/**
 * Contract tussen pagina's en hun API-routes. Een onverwachte vorm is een zichtbare fout, nooit een stille lege lijst.
 * Geen imports: draait ook in de root-tests zonder web/node_modules.
 */

/** /api/runs: met `date` of filters een lijst, anders `{ today, runs }`. */
export function runsFromResponse<T = unknown>(j: unknown): T[] {
  if (Array.isArray(j)) return j as T[];
  if (j && typeof j === 'object' && Array.isArray((j as { runs?: unknown }).runs)) return (j as { runs: T[] }).runs;
  throw new Error('onverwacht antwoord van /api/runs (geen lijst met runs)');
}

/** /api/alpaca/orders: altijd een lijst; een fout-object wordt een fout. */
export function ordersFromResponse<T = unknown>(j: unknown): T[] {
  if (Array.isArray(j)) return j as T[];
  const err = j && typeof j === 'object' ? (j as { error?: unknown }).error : undefined;
  throw new Error(typeof err === 'string' && err ? err : 'onverwacht antwoord van /api/alpaca/orders (geen lijst)');
}

/** fetch + JSON, met de foutmelding van de route als die er is. */
export async function readJson(r: { ok: boolean; status: number; json(): Promise<unknown> }): Promise<unknown> {
  let j: unknown = null;
  try {
    j = await r.json();
  } catch {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    throw new Error('antwoord is geen JSON');
  }
  if (!r.ok) {
    const err = j && typeof j === 'object' ? (j as { error?: unknown }).error : undefined;
    throw new Error(typeof err === 'string' && err ? err : `HTTP ${r.status}`);
  }
  return j;
}
