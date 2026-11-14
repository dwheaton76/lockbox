// Fingerprint / Face ID unlock against a fake WebAuthn platform authenticator that
// implements PRF the way real ones do: HMAC(per-credential secret, salt).
import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { biometricRecord, BiometricUnsupported } from './biometric';
import { toB64 } from './crypto';
import { blankEntry } from './kinds';
import { Vault } from './vault.svelte';
import type { Entry } from './types';

const PASSWORD = 'biometric test master pw';

const authenticator = {
  supportsPrf: true,
  prfOnCreate: true,
  cancel: false,
  credentials: new Map<string, CryptoKey>(),
  getCalls: [] as PublicKeyCredentialRequestOptions[],
};

const toKey = (buf: BufferSource) =>
  toB64(buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer));

async function prf(secret: CryptoKey, salt: BufferSource) {
  return crypto.subtle.sign('HMAC', secret, salt);
}

function fakeCredential(rawId: Uint8Array, results: object) {
  return { rawId: rawId.buffer, getClientExtensionResults: () => results };
}

beforeAll(() => {
  Object.assign(globalThis, {
    location: { hostname: 'localhost' },
    PublicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable: async () => true },
  });
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: {
      async create({ publicKey }: CredentialCreationOptions) {
        if (authenticator.cancel) throw new DOMException('cancelled', 'NotAllowedError');
        expect(publicKey!.authenticatorSelection?.userVerification).toBe('required');
        const rawId = crypto.getRandomValues(new Uint8Array(16));
        const secret = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        authenticator.credentials.set(toKey(rawId), secret);
        const salt = (publicKey!.extensions as { prf: { eval: { first: BufferSource } } }).prf.eval.first;
        if (!authenticator.supportsPrf) return fakeCredential(rawId, {});
        const results = authenticator.prfOnCreate ? { first: await prf(secret, salt) } : undefined;
        return fakeCredential(rawId, { prf: { enabled: true, results } });
      },
      async get({ publicKey }: CredentialRequestOptions) {
        authenticator.getCalls.push(publicKey!);
        if (authenticator.cancel) throw new DOMException('cancelled', 'NotAllowedError');
        const id = publicKey!.allowCredentials![0].id;
        const secret = authenticator.credentials.get(toKey(id));
        if (!secret) throw new DOMException('no such credential', 'NotAllowedError');
        const salt = (publicKey!.extensions as { prf: { eval: { first: BufferSource } } }).prf.eval.first;
        return fakeCredential(new Uint8Array(id as ArrayBuffer), { prf: { results: { first: await prf(secret, salt) } } });
      },
    },
  });
});

beforeEach(() => {
  Object.assign(authenticator, { supportsPrf: true, prfOnCreate: true, cancel: false });
  authenticator.getCalls = [];
});

const login = (title: string): Entry => ({ ...blankEntry('password'), title, password: `${title}-pw` } as Entry);

describe('biometric unlock', () => {
  const vault = new Vault();

  it('is off until enabled', async () => {
    await vault.init();
    await vault.create(PASSWORD);
    await vault.save(login('Bank'));
    expect(vault.biometric).toBe(false);
  });

  it('refuses devices without the PRF extension', async () => {
    authenticator.supportsPrf = false;
    await expect(vault.enableBiometric()).rejects.toBeInstanceOf(BiometricUnsupported);
    expect(vault.biometric).toBe(false);
    expect(await biometricRecord()).toBeUndefined();
  });

  it('enables and unlocks without the master password', async () => {
    await vault.enableBiometric();
    expect(vault.biometric).toBe(true);

    const record = (await biometricRecord())!;
    expect(JSON.stringify(record)).not.toContain('Bank');

    vault.lock();
    await vault.unlockWithBiometric();
    expect(vault.status).toBe('unlocked');
    expect(vault.entries.map((e) => e.title)).toEqual(['Bank']);

    const call = authenticator.getCalls.at(-1)!;
    expect(call.userVerification).toBe('required');
    expect(call.rpId).toBe('localhost');
  });

  it('keeps working after a reload, and saves still use the right key', async () => {
    await vault.save(login('Card'));
    vault.lock();
    const reloaded = new Vault();
    await reloaded.init();
    expect(reloaded.biometric).toBe(true);
    await reloaded.unlockWithBiometric();
    expect(reloaded.entries.map((e) => e.title).sort()).toEqual(['Bank', 'Card']);
    reloaded.lock();
    expect(await reloaded.unlock(PASSWORD)).toBe(true); // master password still works too
    reloaded.lock();
  });

  it('stays locked if the prompt is cancelled', async () => {
    authenticator.cancel = true;
    await expect(vault.unlockWithBiometric()).rejects.toThrow();
    expect(vault.status).toBe('locked');
    expect(vault.biometric).toBe(true); // a cancel doesn't remove the setup
  });

  it('stays locked if the authenticator returns a different secret', async () => {
    authenticator.credentials.forEach((_, id) =>
      crypto.subtle
        .generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
        .then((k) => authenticator.credentials.set(id, k)),
    );
    await new Promise((r) => setTimeout(r, 10));
    await expect(vault.unlockWithBiometric()).rejects.toThrow(/master password/);
    expect(vault.status).toBe('locked');
  });

  it('works with authenticators that only return PRF on sign-in (second prompt during setup)', async () => {
    expect(await vault.unlock(PASSWORD)).toBe(true);
    authenticator.prfOnCreate = false;
    await vault.enableBiometric();
    expect(authenticator.getCalls).toHaveLength(1); // the extra prompt during setup
    vault.lock();
    await vault.unlockWithBiometric();
    expect(vault.entries).toHaveLength(2);
  });

  it('is turned off by a master password change', async () => {
    expect(await vault.changeMasterPassword(PASSWORD, 'a brand new master pw')).toBe(true);
    expect(vault.biometric).toBe(false);
    expect(await biometricRecord()).toBeUndefined();
    vault.lock();
    await expect(vault.unlockWithBiometric()).rejects.toThrow(/set up again/);
    expect(await vault.unlock('a brand new master pw')).toBe(true);
  });
});
