import { buildEtfClientOrderId } from '../../src/alpaca/client-order-id';
import { getRoutineRunContext } from './routine-run-context';

export function etfClientOrderId(input: {
  routine: string;
  symbol: string;
  side: 'buy' | 'sell';
  tag?: string;
  runId?: string;
}): string {
  const ctx = getRoutineRunContext();
  const runId = input.runId ?? ctx?.runId ?? `${input.routine}-local`;
  return buildEtfClientOrderId({
    routine: input.routine,
    runId,
    symbol: input.symbol,
    side: input.side,
    tag: input.tag,
  });
}
