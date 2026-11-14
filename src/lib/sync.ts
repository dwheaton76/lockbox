// Data shape shared by the local vault, backups and the Google Drive copy, plus the
// two-way merge used by sync. Deleted entries leave a tombstone (id → deletedAt) so a
// deletion on one device can be told apart from an entry another device hasn't seen yet.
import { mergeEntries, normalizeEntries } from './merge';
import type { BackupFile } from './backup';
import type { Entry } from './types';

export type Tombstones = Record<string, number>;

export interface VaultData {
  entries: Entry[];
  tombstones: Tombstones;
}

/** Accepts both the current `{ entries, tombstones }` payload and the original bare array. */
export function toVaultData(payload: unknown): VaultData {
  if (Array.isArray(payload)) return { entries: normalizeEntries(payload), tombstones: {} };
  const data = (payload ?? {}) as Partial<VaultData>;
  return { entries: normalizeEntries(data.entries ?? []), tombstones: { ...data.tombstones } };
}

/** The remote copy is encrypted under a different master password than this device's. */
export class RemotePasswordRequired extends Error {
  constructor(readonly file: BackupFile) {
    super('Your Google Drive vault uses a different master password.');
  }
}

export interface SyncResult {
  data: VaultData;
  /** Changes this device received from the remote copy. */
  added: number;
  updated: number;
  removed: number;
}

export function syncMerge(local: VaultData, remote: VaultData): SyncResult {
  const tombstones: Tombstones = { ...local.tombstones };
  for (const [id, deletedAt] of Object.entries(remote.tombstones)) {
    tombstones[id] = Math.max(tombstones[id] ?? 0, deletedAt);
  }

  // An entry survives a tombstone only if it was edited after the deletion.
  const alive = mergeEntries(local.entries, remote.entries).entries.filter(
    (e) => !(tombstones[e.id] >= e.updatedAt),
  );

  const localById = new Map(local.entries.map((e) => [e.id, e]));
  const aliveIds = new Set(alive.map((e) => e.id));
  let added = 0;
  let updated = 0;
  for (const e of alive) {
    const mine = localById.get(e.id);
    if (!mine) added++;
    else if (mine !== e) updated++;
  }
  const removed = local.entries.filter((e) => !aliveIds.has(e.id)).length;

  return { data: { entries: alive, tombstones }, added, updated, removed };
}
