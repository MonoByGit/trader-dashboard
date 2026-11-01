import { AsyncLocalStorage } from 'async_hooks';

export type RoutineRunContext = {
  runId: string;
  routine: string;
  tradingDate: string;
  slotKey: string;
  deadlineMs: number;
};

const store = new AsyncLocalStorage<RoutineRunContext>();

export function withRoutineRunContext<T>(ctx: RoutineRunContext, fn: () => Promise<T>): Promise<T> {
  return store.run(ctx, fn);
}

export function getRoutineRunContext(): RoutineRunContext | undefined {
  return store.getStore();
}
