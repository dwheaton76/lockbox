import { describe, expect, it } from 'vitest';
import { blankEntry } from './kinds';
import { syncMerge, toVaultData, type VaultData } from './sync';
import type { Entry } from './types';

const entry = (id: string, updatedAt: number, title = id): Entry => ({ ...blankEntry('password'), id, title, updatedAt });
const data = (entries: Entry[], tombstones: Record<string, number> = {}): VaultData => ({ entries, tombstones });
const titles = (d: VaultData) => d.entries.map((e) => e.title).sort();

describe('syncMerge', () => {
  it('unions entries from both sides', () => {
    const r = syncMerge(data([entry('a', 1)]), data([entry('b', 1)]));
    expect(titles(r.data)).toEqual(['a', 'b']);
    expect(r).toMatchObject({ added: 1, updated: 0, removed: 0 });
  });

  it('keeps the most recent edit of the same entry', () => {
    const r = syncMerge(data([entry('a', 1, 'old')]), data([entry('a', 2, 'new')]));
    expect(titles(r.data)).toEqual(['new']);
    expect(r.updated).toBe(1);

    const r2 = syncMerge(data([entry('a', 3, 'mine')]), data([entry('a', 2, 'theirs')]));
    expect(titles(r2.data)).toEqual(['mine']);
    expect(r2.updated).toBe(0);
  });

  it('applies a remote deletion', () => {
    const r = syncMerge(data([entry('a', 1), entry('b', 1)]), data([entry('b', 1)], { a: 5 }));
    expect(titles(r.data)).toEqual(['b']);
    expect(r.removed).toBe(1);
    expect(r.data.tombstones).toEqual({ a: 5 });
  });

  it('does not resurrect a locally deleted entry still present remotely', () => {
    const r = syncMerge(data([], { a: 5 }), data([entry('a', 1)]));
    expect(r.data.entries).toEqual([]);
    expect(r.added).toBe(0);
  });

  it('keeps an entry edited after it was deleted elsewhere', () => {
    const r = syncMerge(data([entry('a', 10, 'edited')]), data([], { a: 5 }));
    expect(titles(r.data)).toEqual(['edited']);
  });

  it('keeps the latest of two tombstones', () => {
    expect(syncMerge(data([], { a: 3 }), data([], { a: 7 })).data.tombstones).toEqual({ a: 7 });
  });

  it('is idempotent', () => {
    const local = data([entry('a', 1), entry('b', 2)], { c: 3 });
    const once = syncMerge(local, data([entry('d', 4)], { b: 9 })).data;
    const twice = syncMerge(once, once);
    expect(twice.data).toEqual(once);
    expect(twice).toMatchObject({ added: 0, updated: 0, removed: 0 });
  });
});

describe('toVaultData', () => {
  it('upgrades the original bare-array payload', () => {
    const legacy = [{ ...entry('a', 1), custom: undefined }];
    expect(toVaultData(legacy)).toEqual({ entries: [{ ...entry('a', 1), custom: [] }], tombstones: {} });
  });

  it('tolerates missing pieces', () => {
    expect(toVaultData({})).toEqual({ entries: [], tombstones: {} });
  });
});
