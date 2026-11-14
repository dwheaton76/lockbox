import type { Entry } from './types';

/** Backfills fields added after an entry was first saved (older vaults and backups). */
export function normalizeEntries(entries: Entry[]): Entry[] {
  return entries.map((e) => ({ ...e, tags: e.tags ?? [], custom: e.custom ?? [] }));
}

export interface MergeResult {
  entries: Entry[];
  added: number;
  updated: number;
  unchanged: number;
}

/** Merges by id; an incoming entry wins only if it was edited more recently. */
export function mergeEntries(current: Entry[], incoming: Entry[]): MergeResult {
  const byId = new Map(current.map((e) => [e.id, e]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const entry of incoming) {
    const existing = byId.get(entry.id);
    if (!existing) {
      byId.set(entry.id, entry);
      added++;
    } else if (entry.updatedAt > existing.updatedAt) {
      byId.set(entry.id, entry);
      updated++;
    } else {
      unchanged++;
    }
  }
  return { entries: [...byId.values()], added, updated, unchanged };
}

export function hostOf(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withScheme).hostname.replace(/^www\./, '');
  } catch {
    return trimmed.toLowerCase();
  }
}

/** Identity of a login for duplicate detection (site + username + password). */
export function loginKey(entry: Entry): string | null {
  if (entry.kind !== 'password' && entry.kind !== 'account') return null;
  return [hostOf(entry.url), entry.username.trim().toLowerCase(), entry.password].join('\u0000');
}
