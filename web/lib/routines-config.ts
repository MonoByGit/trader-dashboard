/** Vaste cron-routines (geen demo-lastRun of fake status). */
export const TRADER_ROUTINES = [
  { id: 'premarket', name: 'Premarket Scan', time: '08:30 ET', summary: 'Watchlist scannen en indicatoren bijwerken' },
  { id: 'market-open', name: 'Market Open', time: '09:35 ET', summary: 'Entry-evaluatie op de watchlist' },
  { id: 'midday', name: 'Midday Check', time: '12:30 ET', summary: 'Trailing stops en open posities' },
  { id: 'close', name: 'End-of-Day Close', time: '16:10 ET', summary: 'Open posities sluiten vóór de close' },
  { id: 'weekly', name: 'Weekly Review', time: 'Fri 16:30 ET', summary: 'Weekreview, lessen en rapport' },
] as const;

export type RoutineConfig = (typeof TRADER_ROUTINES)[number];
