import { describe, expect, it } from 'vitest';
import { blankEntry } from './kinds';
import { matches, sortEntries } from './search';
import type { Entry, PasswordEntry } from './types';

function login(title: string, extra: Partial<PasswordEntry> = {}): Entry {
  return { ...(blankEntry('password') as PasswordEntry), title, ...extra };
}

describe('matches', () => {
  const github = login('GitHub', {
    username: 'dev@example.com',
    url: 'github.com',
    password: 'hunter2',
    tags: ['work'],
    custom: [
      { id: '1', label: 'Org', value: 'acme-corp', secret: false },
      { id: '2', label: 'Recovery codes', value: 'zzz-secret', secret: true },
    ],
  });

  it('matches everything for an empty query', () => {
    expect(matches(github, '   ')).toBe(true);
  });

  it('is case-insensitive and needs every term', () => {
    expect(matches(github, 'GIT example')).toBe(true);
    expect(matches(github, 'git gitlab')).toBe(false);
  });

  it('searches visible fields, kind label and custom fields', () => {
    expect(matches(github, 'github.com')).toBe(true);
    expect(matches(github, 'password')).toBe(true);
    expect(matches(github, 'acme')).toBe(true);
    expect(matches(github, 'recovery')).toBe(true);
  });

  it('never matches on secret values', () => {
    expect(matches(github, 'hunter2')).toBe(false);
    expect(matches(github, 'zzz-secret')).toBe(false);
  });

  it('supports exact #tag filters', () => {
    expect(matches(github, '#work')).toBe(true);
    expect(matches(github, '#wor')).toBe(false);
  });
});

describe('sortEntries', () => {
  it('puts favourites first, then sorts by title', () => {
    const sorted = sortEntries([login('zeta'), login('Alpha'), login('mid', { favorite: true })]);
    expect(sorted.map((e) => e.title)).toEqual(['mid', 'Alpha', 'zeta']);
  });
});
