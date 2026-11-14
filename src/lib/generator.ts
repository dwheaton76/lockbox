import { randomBytes, toB64, toB64Url } from './crypto';

export interface PasswordOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  avoidAmbiguous: boolean;
}

export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: 20,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: false,
};

const CHARSETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?/~',
} as const;

const AMBIGUOUS = /[Il1O0o|]/g;
const BASE62 = CHARSETS.digits + CHARSETS.upper + CHARSETS.lower;
const PREFS_KEY = 'lockbox.generator';

/** Uniform integer in [0, max) using rejection sampling to avoid modulo bias. */
export function randomInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
}

function charGroups(opts: PasswordOptions): string[] {
  return (Object.keys(CHARSETS) as (keyof typeof CHARSETS)[])
    .filter((k) => opts[k])
    .map((k) => (opts.avoidAmbiguous ? CHARSETS[k].replace(AMBIGUOUS, '') : CHARSETS[k]));
}

export function generatePassword(opts: PasswordOptions = DEFAULT_PASSWORD_OPTIONS): string {
  const groups = charGroups(opts);
  if (!groups.length) return '';
  const pool = groups.join('');
  // Guarantee at least one character from every selected group, then shuffle.
  const chars = groups.map((g) => g[randomInt(g.length)]);
  while (chars.length < opts.length) chars.push(pool[randomInt(pool.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function passwordEntropy(opts: PasswordOptions): number {
  const pool = charGroups(opts).join('').length;
  return pool ? Math.round(opts.length * Math.log2(pool)) : 0;
}

export function generateApiKey(prefix = 'sk', length = 40): string {
  const body = Array.from({ length }, () => BASE62[randomInt(BASE62.length)]).join('');
  return prefix ? `${prefix}_${body}` : body;
}

export function apiKeyEntropy(length: number): number {
  return Math.round(length * Math.log2(BASE62.length));
}

export function strengthOf(bits: number): { label: string; pct: number; level: 0 | 1 | 2 | 3 } {
  const pct = Math.min(100, Math.round((bits / 128) * 100));
  if (bits < 50) return { label: 'Weak', pct, level: 0 };
  if (bits < 80) return { label: 'Fair', pct, level: 1 };
  if (bits < 110) return { label: 'Strong', pct, level: 2 };
  return { label: 'Excellent', pct, level: 3 };
}

/**
 * Creates a WebAuthn-style ES256 (P-256) credential key pair.
 * Note: a web page cannot register itself as the OS passkey provider, so these are stored
 * for safekeeping / export; using them to sign in needs a native credential-provider shell.
 */
export async function generatePasskeyCredential() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const [spki, pkcs8] = await Promise.all([
    crypto.subtle.exportKey('spki', pair.publicKey),
    crypto.subtle.exportKey('pkcs8', pair.privateKey),
  ]);
  return {
    credentialId: toB64Url(randomBytes(32)),
    userHandle: toB64Url(randomBytes(16)),
    publicKey: toB64(new Uint8Array(spki)),
    privateKey: toB64(new Uint8Array(pkcs8)),
  };
}

// Generator preferences are not secret, so they live in localStorage.
export function loadPasswordOptions(): PasswordOptions {
  try {
    return { ...DEFAULT_PASSWORD_OPTIONS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULT_PASSWORD_OPTIONS };
  }
}

export function savePasswordOptions(opts: PasswordOptions): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(opts));
}
