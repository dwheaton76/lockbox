// End-to-end tests of the vault store against an in-memory IndexedDB.
// Uses real PBKDF2 settings, so each unlock takes a moment.
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { idbGet } from './db';
import { blankEntry } from './kinds';
import { backupKey, createBackup, openBackup, openVaultFile, parseBackup } from './backup';
import { deriveKey, fromB64, randomBytes, toB64 } from './crypto';
import { RemotePasswordRequired, type VaultData } from './sync';
import { vault } from './vault.svelte';
import type { Entry } from './types';

const login = (title: string): Entry => ({ ...blankEntry('password'), title, password: `${title}-pw` } as Entry);

describe('vault', () => {
  beforeAll(async () => {
    await vault.init();
  });

  it('starts as a new vault', () => {
    expect(vault.status).toBe('new');
  });

  it('creates, saves and persists encrypted entries', async () => {
    await vault.create('first master password');
    expect(vault.status).toBe('unlocked');
    await vault.save(login('GitHub'));
    expect(vault.entries).toHaveLength(1);

    const stored = JSON.stringify(await idbGet('vault'));
    expect(stored).not.toContain('GitHub');
    expect(stored).not.toContain('GitHub-pw');
  });

  it('locks and refuses the wrong password', async () => {
    vault.lock();
    expect(vault.entries).toHaveLength(0);
    expect(await vault.unlock('wrong password')).toBe(false);
    expect(vault.status).toBe('locked');
  });

  it('unlocks with the right password', async () => {
    expect(await vault.unlock('first master password')).toBe(true);
    expect(vault.entries.map((e) => e.title)).toEqual(['GitHub']);
  });

  it('refuses to change the master password if the current one is wrong', async () => {
    expect(await vault.changeMasterPassword('not it', 'second master password')).toBe(false);
  });

  it('changes the master password', async () => {
    const before = await idbGet<{ salt: string }>('meta');
    expect(await vault.changeMasterPassword('first master password', 'second master password')).toBe(true);
    const after = await idbGet<{ salt: string }>('meta');
    expect(after!.salt).not.toBe(before!.salt);

    // Saving after the change must use the new key.
    await vault.save(login('GitLab'));
    vault.lock();
    expect(await vault.unlock('first master password')).toBe(false);
    expect(await vault.unlock('second master password')).toBe(true);
    expect(vault.entries.map((e) => e.title).sort()).toEqual(['GitHub', 'GitLab']);
  });

  it('exports a backup that opens with the current master password', async () => {
    const file = parseBackup(await vault.exportBackup())!;
    expect(file).not.toBeNull();
    expect(await openBackup(file, 'first master password')).toBeNull();
    const entries = await openBackup(file, 'second master password');
    expect(entries!.map((e) => e.title).sort()).toEqual(['GitHub', 'GitLab']);
  });

  it('imports by merging, without duplicating existing entries', async () => {
    const backupEntries = (await openBackup(parseBackup(await vault.exportBackup())!, 'second master password'))!;
    const result = await vault.importEntries([...backupEntries, login('Bitbucket')]);
    expect(result).toMatchObject({ added: 1, updated: 0, unchanged: 2 });
    expect(vault.entries).toHaveLength(3);

    const imported = vault.entries.find((e) => e.title === 'Bitbucket')!;
    expect(imported.createdAt).toBeGreaterThan(0);
    expect(imported.updatedAt).toBeGreaterThan(0);
  });
});

/**
 * Two-device sync against an in-memory "Google Drive". The second device is simulated by
 * decrypting the remote file with its password, editing it, and re-encrypting it.
 */
describe('vault sync', () => {
  const PASSWORD = 'second master password'; // current password from the tests above
  let remote: string | null = null;
  const write = async (text: string) => {
    remote = text;
  };
  const titles = () => vault.entries.map((e) => e.title).sort();

  async function otherDevice(edit: (data: VaultData) => void, password = PASSWORD) {
    const file = parseBackup(remote!)!;
    const key = await backupKey(file, password);
    const data = (await openVaultFile(file, key))!;
    edit(data);
    remote = await createBackup(key, file.kdf, data);
  }

  it('pushes everything on the first sync', async () => {
    const result = await vault.sync(remote, write);
    expect(result).toMatchObject({ added: 0, updated: 0, removed: 0 });
    expect(remote).not.toContain('GitHub');
    expect(await openBackup(parseBackup(remote!)!, PASSWORD)).toHaveLength(3);
  });

  it('pulls additions, edits and deletions made on another device', async () => {
    await otherDevice((d) => {
      d.entries.push({ ...login('Phone-only'), createdAt: 1, updatedAt: Date.now() });
      const gh = d.entries.find((e) => e.title === 'GitHub')!;
      gh.title = 'GitHub (renamed)';
      gh.updatedAt = Date.now() + 1;
      const bb = d.entries.find((e) => e.title === 'Bitbucket')!;
      d.entries = d.entries.filter((e) => e !== bb);
      d.tombstones[bb.id] = Date.now() + 1;
    });
    const result = await vault.sync(remote, write);
    expect(result).toMatchObject({ added: 1, updated: 1, removed: 1 });
    expect(titles()).toEqual(['GitHub (renamed)', 'GitLab', 'Phone-only']);
  });

  it('pushes local deletions so other devices drop them', async () => {
    const gitlab = vault.entries.find((e) => e.title === 'GitLab')!;
    await vault.remove(gitlab.id);
    await vault.sync(remote, write);
    const remoteTitles = (await openBackup(parseBackup(remote!)!, PASSWORD))!.map((e) => e.title).sort();
    expect(remoteTitles).toEqual(['GitHub (renamed)', 'Phone-only']);
  });

  it('keeps an entry restored from a backup after it was deleted', async () => {
    const backup = (await openBackup(parseBackup(await vault.exportBackup())!, PASSWORD))!;
    const phoneOnly = vault.entries.find((e) => e.title === 'Phone-only')!;
    await vault.remove(phoneOnly.id);
    await vault.sync(remote, write);
    await vault.importEntries(backup);
    await vault.sync(remote, write);
    expect(titles()).toContain('Phone-only');
  });

  it('keeps a restored entry even when the deletion came from a device with a clock running ahead', async () => {
    const backup = (await openBackup(parseBackup(await vault.exportBackup())!, PASSWORD))!;
    const phoneOnly = vault.entries.find((e) => e.title === 'Phone-only')!;
    await otherDevice((d) => {
      d.entries = d.entries.filter((e) => e.id !== phoneOnly.id);
      d.tombstones[phoneOnly.id] = Date.now() + 60_000; // other device's clock is a minute fast
    });
    await vault.sync(remote, write);
    expect(titles()).not.toContain('Phone-only');

    await vault.importEntries(backup);
    await vault.sync(remote, write);
    expect(titles()).toContain('Phone-only');
  });

  it('never overwrites a remote vault it cannot decrypt, and can adopt its password', async () => {
    // Simulate another device that changed the master password.
    const file = parseBackup(remote!)!;
    const data = (await openVaultFile(file, await backupKey(file, PASSWORD)))!;
    const newKdf = { salt: toB64(randomBytes(16)), iterations: 1_000 };
    remote = await createBackup(await deriveKey('phone password!!', fromB64(newKdf.salt), newKdf.iterations), newKdf, data);
    const before = remote;

    const error = await vault.sync(remote, write).catch((e) => e);
    expect(error).toBeInstanceOf(RemotePasswordRequired);
    expect(remote).toBe(before); // untouched

    expect(await vault.adoptRemotePassword('wrong', error.file)).toBe(false);
    expect(await vault.adoptRemotePassword('phone password!!', error.file)).toBe(true);
    await vault.sync(remote, write);

    // This device now unlocks with the adopted password.
    vault.lock();
    expect(await vault.unlock(PASSWORD)).toBe(false);
    expect(await vault.unlock('phone password!!')).toBe(true);
    expect(titles()).toContain('Phone-only');
  });
});
