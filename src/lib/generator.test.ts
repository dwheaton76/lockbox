import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PASSWORD_OPTIONS,
  generateApiKey,
  generatePasskeyCredential,
  generatePassword,
  passwordEntropy,
  randomInt,
  strengthOf,
} from './generator';
import { fromB64 } from './crypto';

describe('randomInt', () => {
  it('stays in range and covers every value', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i++) {
      const n = randomInt(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
      seen.add(n);
    }
    expect(seen.size).toBe(7);
  });
});

describe('generatePassword', () => {
  it('honours the requested length', () => {
    for (const length of [8, 20, 64]) {
      expect(generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length })).toHaveLength(length);
    }
  });

  it('includes at least one character from every enabled set', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 8 });
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(/[^a-zA-Z0-9]/);
    }
  });

  it('only uses enabled sets', () => {
    const pw = generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, upper: false, symbols: false, length: 64 });
    expect(pw).toMatch(/^[a-z0-9]+$/);
  });

  it('can exclude look-alike characters', () => {
    const pw = generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, avoidAmbiguous: true, length: 64 });
    for (let i = 0; i < 50; i++) expect(pw).not.toMatch(/[Il1O0o|]/);
  });

  it('returns an empty string when no sets are enabled', () => {
    const none = { ...DEFAULT_PASSWORD_OPTIONS, lower: false, upper: false, digits: false, symbols: false };
    expect(generatePassword(none)).toBe('');
    expect(passwordEntropy(none)).toBe(0);
  });
});

describe('entropy & strength', () => {
  it('rates the defaults as strong or better', () => {
    expect(strengthOf(passwordEntropy(DEFAULT_PASSWORD_OPTIONS)).level).toBeGreaterThanOrEqual(2);
  });

  it('rates short digit-only passwords as weak', () => {
    const pin = { ...DEFAULT_PASSWORD_OPTIONS, length: 8, lower: false, upper: false, symbols: false };
    expect(strengthOf(passwordEntropy(pin)).label).toBe('Weak');
  });
});

describe('generateApiKey', () => {
  it('produces a prefixed base62 key', () => {
    expect(generateApiKey('sk', 40)).toMatch(/^sk_[0-9A-Za-z]{40}$/);
    expect(generateApiKey('', 16)).toMatch(/^[0-9A-Za-z]{16}$/);
  });
});

describe('generatePasskeyCredential', () => {
  it('creates a usable ES256 key pair', async () => {
    const cred = await generatePasskeyCredential();
    const algo = { name: 'ECDSA', namedCurve: 'P-256' };
    const priv = await crypto.subtle.importKey('pkcs8', fromB64(cred.privateKey), algo, false, ['sign']);
    const pub = await crypto.subtle.importKey('spki', fromB64(cred.publicKey), algo, false, ['verify']);
    const data = new TextEncoder().encode('challenge');
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, data);
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig, data)).toBe(true);
    expect(cred.credentialId).toMatch(/^[\w-]{43}$/);
  });
});
