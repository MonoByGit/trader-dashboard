import { runMomentum6 } from '@/lib/momentum6/run';

/** POST { step: 'decide' | 'execute' }. Alleen schaduw; MOMENTUM6_ENABLED=1 vereist. */
export async function POST(req: Request) {
  const body = (await req.json()) as { step?: 'decide' | 'execute' };
  const step = body.step ?? 'decide';
  return Response.json(await runMomentum6(step));
}
