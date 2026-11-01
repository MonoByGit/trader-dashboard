import type { VersionConfig } from './types';

/** Prefix voor client_order_id (m3-, m5-, m6- of m2-<versie>). */
export function momentumOrderTag(cfg: Pick<VersionConfig, 'id' | 'orderTag'>): string {
  if (cfg.orderTag) return cfg.orderTag;
  if (cfg.id.startsWith('m3-')) return 'm3';
  if (cfg.id.startsWith('m5-')) return 'm5';
  if (cfg.id.startsWith('m6-')) return 'm6';
  return `m2-${cfg.id}`;
}

export function momentumStopTag(cfg: Pick<VersionConfig, 'id' | 'orderTag'>): string {
  const tag = momentumOrderTag(cfg);
  if (tag.startsWith('m2-')) return `m2s-${cfg.id}`;
  return `${tag}s`;
}
