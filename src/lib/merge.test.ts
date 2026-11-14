import { describe, expect, it } from 'vitest';
import { blankEntry } from './kinds';
import { hostOf, mergeEntries, normalizeEntries } from './merge';
import type { Entry } from './types';

const entry = (id: string, updatedAt: number, title = id): Entry => ({ ...blankEntry('password'), id, title, updatedAt });

describe('mergeEntries', () => {
  it('adds new entries, updates newer ones and keeps the rest', () => {
    const current = [entry('a', 100), entry('b', 100)];
    const incoming = [entry('a', 200, 'A newer'), entry('b', 50, 'B older'), entry('c', 10)];
    const result = mergeEntries(current, incoming);
    expect(result).toMatchObject({ added: 1, updated: 1, unchanged: 1 });
    expect(result.entries.map((e) => e.title).sort()).toEqual(['A newer', 'b', 'c']);
  });

  it('does not mutate its inputs', () => {
    const current = [entry('a', 1)];
    mergeEntries(current, [entry('a', 2), entry('b', 1)]);
    expect(current).toHaveLength(1);
    expect(current[0].updatedAt).toBe(1);
  });
});

describe('normalizeEntries', () => {
  it('backfills fields missing from older data', () => {
    const old = { ...entry('a', 1) } as Partial<Entry>;
    delete old.custom;
    delete old.tags;
    expect(normalizeEntries([old as Entry])[0]).toMatchObject({ custom: [], tags: [] });
  });
});

describe('hostOf', () => {
  it('normalises URLs to a bare host', () => {
    expect(hostOf('https://www.github.com/login?x=1')).toBe('github.com');
    expect(hostOf('github.com/path')).toBe('github.com');
    expect(hostOf('  ')).toBe('');
  });
});
