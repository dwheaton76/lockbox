import { describe, expect, it } from 'vitest';
import { base32Decode, parseTotp, secondsRemaining, totpCode, type TotpParams } from './totp';

const ascii = (s: string) => new TextEncoder().encode(s);

// RFC 6238 Appendix B test vectors (8 digits).
const RFC_KEYS: Record<TotpParams['algorithm'], Uint8Array<ArrayBuffer>> = {
  'SHA-1': ascii('12345678901234567890'),
  'SHA-256': ascii('12345678901234567890123456789012'),
  'SHA-512': ascii('1234567890123456789012345678901234567890123456789012345678901234'),
};
const VECTORS: [number, TotpParams['algorithm'], string][] = [
  [59, 'SHA-1', '94287082'],
  [59, 'SHA-256', '46119246'],
  [59, 'SHA-512', '90693936'],
  [1111111109, 'SHA-1', '07081804'],
  [1111111109, 'SHA-256', '68084774'],
  [1111111109, 'SHA-512', '25091201'],
  [1111111111, 'SHA-512', '99943326'],
  [1234567890, 'SHA-1', '89005924'],
  [2000000000, 'SHA-256', '90698825'],
  [20000000000, 'SHA-512', '47863826'],
];

describe('totpCode', () => {
  it.each(VECTORS)('matches RFC 6238 at T=%s with %s', async (seconds, algorithm, expected) => {
    const params: TotpParams = { secret: RFC_KEYS[algorithm], digits: 8, period: 30, algorithm };
    expect(await totpCode(params, seconds * 1000)).toBe(expected);
  });

  it('pads 6-digit codes with leading zeros', async () => {
    const params: TotpParams = { secret: RFC_KEYS['SHA-1'], digits: 6, period: 30, algorithm: 'SHA-1' };
    expect(await totpCode(params, 1111111109 * 1000)).toBe('081804');
  });
});

describe('base32Decode', () => {
  it('decodes RFC 4648 vectors, ignoring case, spaces and padding', () => {
    expect(new TextDecoder().decode(base32Decode('MZXW6YTBOI======')!)).toBe('foobar');
    expect(new TextDecoder().decode(base32Decode('mzxw 6ytb oi')!)).toBe('foobar');
  });

  it('rejects invalid characters', () => {
    expect(base32Decode('NOT-BASE32!')).toBeNull();
    expect(base32Decode('')).toBeNull();
  });
});

describe('parseTotp', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // base32("12345678901234567890")

  it('accepts a bare base32 secret with defaults', () => {
    expect(parseTotp(` ${secret.toLowerCase()} `)).toMatchObject({ digits: 6, period: 30, algorithm: 'SHA-1' });
  });

  it('reads otpauth:// URIs from QR codes', async () => {
    const p = parseTotp(`otpauth://totp/Example:alice@example.com?secret=${secret}&issuer=Example&digits=8&algorithm=SHA1`)!;
    expect(p).toMatchObject({ digits: 8, period: 30, algorithm: 'SHA-1' });
    expect(await totpCode(p, 59_000)).toBe('94287082');
  });

  it('rejects HOTP, junk and too-short secrets', () => {
    expect(parseTotp(`otpauth://hotp/x?secret=${secret}&counter=1`)).toBeNull();
    expect(parseTotp('hello world')).toBeNull();
    expect(parseTotp('MZXW6YQ')).toBeNull();
    expect(parseTotp(`otpauth://totp/x?secret=${secret}&digits=3`)).toBeNull();
  });
});

describe('secondsRemaining', () => {
  it('counts down within the period', () => {
    expect(secondsRemaining(30, 0)).toBe(30);
    expect(secondsRemaining(30, 29_000)).toBe(1);
    expect(secondsRemaining(30, 30_000)).toBe(30);
  });
});
