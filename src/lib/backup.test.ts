import { describe, expect, it } from 'vitest';
import { createBackup, openBackup, parseBackup } from './backup';
import { deriveKey, fromB64, randomBytes, seal, toB64 } from './crypto';
import { blankEntry } from './kinds';

const kdf = { salt: toB64(randomBytes(16)), iterations: 1_000 };

async function makeBackup(password: string) {
  const key = await deriveKey(password, fromB64(kdf.salt), kdf.iterations);
  const entries = [{ ...blankEntry('apikey'), title: 'Stripe', secret: 'sk_live_xyz' }];
  return { text: await createBackup(key, kdf, { entries, tombstones: {} }), entries };
}

describe('backup', () => {
  it('round-trips with the right password', async () => {
    const { text, entries } = await makeBackup('master pw');
    expect(text).not.toContain('Stripe');
    expect(text).not.toContain('sk_live_xyz');
    const file = parseBackup(text)!;
    expect(await openBackup(file, 'master pw')).toEqual(entries);
  });

  it('returns null for the wrong password', async () => {
    const { text } = await makeBackup('master pw');
    expect(await openBackup(parseBackup(text)!, 'nope')).toBeNull();
  });

  it('only recognises Lockbox backup files', () => {
    expect(parseBackup('name,url\n')).toBeNull();
    expect(parseBackup('{"format":"something-else"}')).toBeNull();
    expect(parseBackup('{"format":"lockbox-backup","kdf":{},"vault":{}}')).toBeNull();
  });

  it('still opens files from before tombstones existed (bare entry array)', async () => {
    const key = await deriveKey('pw', fromB64(kdf.salt), kdf.iterations);
    const entries = [{ ...blankEntry('password'), title: 'Old' }];
    const legacy = JSON.parse(await createBackup(key, kdf, { entries, tombstones: {} }));
    legacy.vault = await seal(key, entries);
    expect(await openBackup(parseBackup(JSON.stringify(legacy))!, 'pw')).toEqual(entries);
  });

  it('refuses absurd iteration counts', async () => {
    const { text } = await makeBackup('pw');
    const file = parseBackup(text)!;
    await expect(openBackup({ ...file, kdf: { ...file.kdf, iterations: 1e9 } }, 'pw')).rejects.toThrow(/unsupported/);
  });
});
