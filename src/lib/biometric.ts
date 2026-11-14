// Fingerprint / Face ID unlock via WebAuthn's PRF extension.
//
// Enabling creates a device-bound credential (a passkey for this site). After a successful
// biometric check, the authenticator returns a secret derived from that credential and a
// salt we choose (PRF output); only that device can produce it. We stretch it with HKDF into
// an AES key and use it to wrap the vault key. The wrapped key stays on this device only.
// There is no server: the "challenge" is never verified, the PRF output is what matters.
import { fromB64, open, randomBytes, seal, toB64, type Bytes, type Sealed } from './crypto';
import { idbDelete, idbGet, idbSet } from './db';

const RECORD = 'biometric';
const INFO = new TextEncoder().encode('lockbox biometric unlock v1');

export interface BiometricRecord {
  credentialId: string;
  prfSalt: string;
  /** The vault key, wrapped with the PRF-derived key. */
  wrapped: Sealed;
  /** Salt of the master-password KDF this key belongs to; a password change makes it stale. */
  vaultSalt: string;
}

export class BiometricUnsupported extends Error {
  constructor() {
    super("This device or browser can't use fingerprint / Face ID to encrypt (WebAuthn PRF isn't available).");
  }
}

type PrfOutputs = { prf?: { enabled?: boolean; results?: { first?: BufferSource } } };

/** Is there a fingerprint / face / device-PIN authenticator built into this device? */
export async function biometricAvailable(): Promise<boolean> {
  if (typeof PublicKeyCredential === 'undefined') return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export const biometricRecord = () => idbGet<BiometricRecord>(RECORD);
export const disableBiometric = () => idbDelete(RECORD);

async function wrappingKey(prf: BufferSource): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', prf, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: INFO },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Asks for the biometric and returns the credential's PRF output for `prfSalt`. */
async function evaluatePrf(credentialId: Bytes, prfSalt: Bytes): Promise<BufferSource> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: credentialId }],
      userVerification: 'required',
      timeout: 60_000,
      extensions: { prf: { eval: { first: prfSalt } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  const first = (assertion?.getClientExtensionResults() as PrfOutputs | undefined)?.prf?.results?.first;
  if (!first) throw new BiometricUnsupported();
  return first;
}

/** Registers a credential and stores the wrapped vault key. Shows the biometric prompt (once or twice). */
export async function enableBiometric(vaultKey: Bytes, vaultSalt: string): Promise<void> {
  const prfSalt = randomBytes(32);
  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Lockbox', id: location.hostname },
      user: { id: randomBytes(16), name: 'Lockbox vault', displayName: 'Lockbox vault unlock' },
      challenge: randomBytes(32),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256 (Windows Hello)
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
      timeout: 60_000,
      extensions: { prf: { eval: { first: prfSalt } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error('Setup was cancelled.');

  const prf = (credential.getClientExtensionResults() as PrfOutputs).prf;
  if (!prf?.enabled && !prf?.results?.first) throw new BiometricUnsupported();
  const credentialId = new Uint8Array(credential.rawId);
  // Some authenticators only return PRF output on sign-in, not on creation: ask once more.
  const output = prf.results?.first ?? (await evaluatePrf(credentialId, prfSalt));

  const record: BiometricRecord = {
    credentialId: toB64(credentialId),
    prfSalt: toB64(prfSalt),
    wrapped: await seal(await wrappingKey(output), toB64(vaultKey)),
    vaultSalt,
  };
  await idbSet(RECORD, record);
}

/** Shows the biometric prompt and returns the unwrapped vault key bytes. */
export async function unwrapWithBiometric(record: BiometricRecord): Promise<Bytes> {
  const output = await evaluatePrf(fromB64(record.credentialId), fromB64(record.prfSalt));
  try {
    return fromB64(await open<string>(await wrappingKey(output), record.wrapped));
  } catch {
    throw new Error("Fingerprint / Face ID unlock didn't work. Unlock with your master password.");
  }
}
