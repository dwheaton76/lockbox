// Time-based one-time passwords (RFC 6238), as shown by authenticator apps.
// Accepts a bare base32 secret ("JBSW Y3DP …") or an otpauth:// URI from a QR code.
import type { Bytes } from './crypto';

export type TotpAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512';

export interface TotpParams {
  secret: Bytes;
  digits: number;
  period: number;
  algorithm: TotpAlgorithm;
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32; ignores spaces, dashes, padding and case. Returns null if invalid. */
export function base32Decode(input: string): Bytes | null {
  const clean = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    value = (value << 5) | BASE32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Parses a base32 secret or otpauth://totp/... URI. Returns null if it isn't usable. */
export function parseTotp(input: string): TotpParams | null {
  const text = input.trim();
  let secretText = text;
  let digits = 6;
  let period = 30;
  let algorithm: TotpAlgorithm = 'SHA-1';

  if (/^otpauth:/i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    if (url.host.toLowerCase() !== 'totp') return null; // HOTP (counter-based) isn't supported
    const p = url.searchParams;
    secretText = p.get('secret') ?? '';
    digits = Number(p.get('digits') ?? 6);
    period = Number(p.get('period') ?? 30);
    const algo = (p.get('algorithm') ?? 'SHA1').toUpperCase().replace('-', '');
    algorithm = algo === 'SHA256' ? 'SHA-256' : algo === 'SHA512' ? 'SHA-512' : 'SHA-1';
  }

  const secret = base32Decode(secretText);
  if (!secret || secret.length < 10) return null; // RFC 4226 requires ≥ 128 bits; allow common 80-bit keys
  if (!Number.isInteger(digits) || digits < 6 || digits > 10) return null;
  if (!Number.isInteger(period) || period < 1 || period > 300) return null;
  return { secret, digits, period, algorithm };
}

/** The code for `time` (ms since epoch). */
export async function totpCode(params: TotpParams, time = Date.now()): Promise<string> {
  const counter = Math.floor(time / 1000 / params.period);
  const msg = new DataView(new ArrayBuffer(8));
  msg.setUint32(0, Math.floor(counter / 0x1_0000_0000));
  msg.setUint32(4, counter >>> 0);

  const key = await crypto.subtle.importKey('raw', params.secret, { name: 'HMAC', hash: params.algorithm }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg.buffer));
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** params.digits).padStart(params.digits, '0');
}

/** Seconds until the current code expires. */
export function secondsRemaining(period: number, time = Date.now()): number {
  return period - (Math.floor(time / 1000) % period);
}
