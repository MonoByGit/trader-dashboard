import { runMomentum5 } from '@/lib/momentum5/run';

/** POST { step: 'decide' | 'execute' }. Alleen schaduw; MOMENTUM5_ENABLED=1 vereist. */
export async function POST(req: Request) {
  const body = (await req.json()) as { step?: 'decide' | 'execute' };
  const step = body.step ?? 'decide';
  return Response.json(await runMomentum5(step));
}
