// Client-side encryption: PBKDF2-SHA256 derives an AES-256-GCM key from the master password.

export type Bytes = Uint8Array<ArrayBuffer>;

export const PBKDF2_ITERATIONS = 600_000;

export interface Sealed {
  iv: string;
  data: string;
}

/** Key-derivation parameters stored alongside ciphertext (base64 salt). */
export interface KdfParams {
  salt: string;
  iterations: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function toB64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromB64(b64: string): Bytes {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function toB64Url(bytes: Uint8Array): string {
  return toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * `extractable` is only set for the live vault key, so it can be wrapped for biometric
 * unlock. (Anything able to run code on the page could decrypt the vault anyway.)
 */
export async function deriveKey(
  password: string,
  salt: Bytes,
  iterations = PBKDF2_ITERATIONS,
  extractable = false,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

export async function exportRawKey(key: CryptoKey): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

export function importRawKey(raw: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function seal(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = randomBytes(12);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(value)));
  return { iv: toB64(iv), data: toB64(new Uint8Array(data)) };
}

/** Throws if the key is wrong or the data was tampered with (GCM auth tag mismatch). */
export async function open<T>(key: CryptoKey, sealed: Sealed): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(sealed.iv) }, key, fromB64(sealed.data));
  return JSON.parse(decoder.decode(plain)) as T;
}
