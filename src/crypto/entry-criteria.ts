export interface CryptoEntryRules {
  rsi_min: number;
  rsi_max: number;
  volume_ratio_min: number;
}

export interface CryptoEntrySnapshot {
  rsi: number;
  volumeRatio: number;
}

/** Hard post-check after AI: strategy.json rsi/volume rules. */
export function passesCryptoEntryCriteria(
  snap: CryptoEntrySnapshot,
  rules: CryptoEntryRules,
): { ok: true } | { ok: false; reason: string } {
  if (!Number.isFinite(snap.rsi) || !Number.isFinite(snap.volumeRatio)) {
    return { ok: false, reason: 'Invalid indicator snapshot' };
  }
  if (snap.rsi < rules.rsi_min) {
    return { ok: false, reason: `RSI ${snap.rsi} below min ${rules.rsi_min}` };
  }
  if (snap.rsi > rules.rsi_max) {
    return { ok: false, reason: `RSI ${snap.rsi} above max ${rules.rsi_max}` };
  }
  if (snap.volumeRatio < rules.volume_ratio_min) {
    return {
      ok: false,
      reason: `Volume ratio ${snap.volumeRatio} below min ${rules.volume_ratio_min}`,
    };
  }
  return { ok: true };
}
