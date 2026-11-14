import { describe, expect, it } from 'vitest';
import { deriveKey, fromB64, open, randomBytes, seal, toB64, toB64Url } from './crypto';

const FAST = 1_000; // low iteration count keeps tests quick; production uses 600k

describe('crypto', () => {
  it('round-trips base64 and base64url', () => {
    const bytes = randomBytes(64);
    expect(fromB64(toB64(bytes))).toEqual(bytes);
    expect(toB64Url(bytes)).not.toMatch(/[+/=]/);
  });

  it('seals and opens with the same password', async () => {
    const salt = randomBytes(16);
    const key = await deriveKey('correct horse', salt, FAST);
    const value = { hello: 'world', list: [1, 2, 3] };
    const sealed = await seal(key, value);
    expect(sealed.data).not.toContain('world');
    expect(await open(await deriveKey('correct horse', salt, FAST), sealed)).toEqual(value);
  });

  it('uses a fresh IV per seal', async () => {
    const key = await deriveKey('pw', randomBytes(16), FAST);
    const [a, b] = await Promise.all([seal(key, 'same'), seal(key, 'same')]);
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it('rejects the wrong password', async () => {
    const salt = randomBytes(16);
    const sealed = await seal(await deriveKey('right', salt, FAST), 'secret');
    await expect(open(await deriveKey('wrong', salt, FAST), sealed)).rejects.toThrow();
  });

  it('rejects tampered ciphertext', async () => {
    const key = await deriveKey('pw', randomBytes(16), FAST);
    const sealed = await seal(key, 'secret');
    const bytes = fromB64(sealed.data);
    bytes[0] ^= 1;
    await expect(open(key, { ...sealed, data: toB64(bytes) })).rejects.toThrow();
  });
});
