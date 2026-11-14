// Reactive vault store. The whole vault is encrypted as a single blob, so titles,
// URLs and usernames are never stored in plaintext either.
import { PBKDF2_ITERATIONS, deriveKey, fromB64, open, randomBytes, seal, toB64, type KdfParams, type Sealed } from './crypto';
import { idbGet, idbSet, idbSetMany } from './db';
import { backupKey, createBackup, openVaultFile, parseBackup, type BackupFile } from './backup';
import { mergeEntries, type MergeResult } from './merge';
import { RemotePasswordRequired, syncMerge, toVaultData, type SyncResult, type Tombstones, type VaultData } from './sync';
import type { Entry } from './types';

export const MIN_MASTER_LENGTH = 10;
/** Lock after this long without interaction. */
export const AUTO_LOCK_MS = 5 * 60_000;
/** Lock after the app has been in the background this long (allows quick copy → paste trips). */
export const BACKGROUND_LOCK_MS = 60_000;

interface VaultMeta extends KdfParams {
  version: 1;
}

/** Ask the browser not to evict the vault under storage pressure (mobile browsers do this). */
function requestPersistence() {
  navigator.storage?.persist?.().catch(() => {});
}

function newMeta(): VaultMeta {
  return { version: 1, salt: toB64(randomBytes(16)), iterations: PBKDF2_ITERATIONS };
}

type Status = 'loading' | 'new' | 'locked' | 'unlocked';

export class Vault {
  status = $state<Status>('loading');
  entries = $state<Entry[]>([]);
  /** Bumped on every user change (not on sync), so sync can push edits. */
  revision = $state(0);
  #tombstones: Tombstones = {};
  #key: CryptoKey | null = null;
  #meta: VaultMeta | null = null;

  async init() {
    this.status = (await idbGet<VaultMeta>('meta')) ? 'locked' : 'new';
  }

  async create(master: string) {
    requestPersistence();
    const meta = newMeta();
    const key = await deriveKey(master, fromB64(meta.salt), meta.iterations);
    await idbSetMany({ vault: await seal(key, { entries: [], tombstones: {} }), meta });
    this.#key = key;
    this.#meta = meta;
    this.#tombstones = {};
    this.entries = [];
    this.status = 'unlocked';
  }

  /** Resolves false on a wrong master password. */
  async unlock(master: string): Promise<boolean> {
    const [meta, sealed] = await Promise.all([idbGet<VaultMeta>('meta'), idbGet<Sealed>('vault')]);
    if (!meta || !sealed) throw new Error('Vault data is missing.');
    const key = await deriveKey(master, fromB64(meta.salt), meta.iterations);
    let data: VaultData;
    try {
      data = toVaultData(await open(key, sealed));
    } catch {
      return false;
    }
    this.entries = data.entries;
    this.#tombstones = data.tombstones;
    this.#key = key;
    this.#meta = meta;
    this.status = 'unlocked';
    requestPersistence();
    return true;
  }

  lock() {
    this.#key = null;
    this.#meta = null;
    this.#tombstones = {};
    this.entries = [];
    this.status = 'locked';
  }

  /**
   * Re-encrypts the vault under a new master password with a fresh salt.
   * Resolves false if `current` is wrong. Vault and meta are written in one
   * transaction, so a crash can never leave them mismatched (which would lock you out).
   */
  async changeMasterPassword(current: string, next: string): Promise<boolean> {
    if (!this.#meta) throw new Error('Vault is locked.');
    const sealed = await idbGet<Sealed>('vault');
    const currentKey = await deriveKey(current, fromB64(this.#meta.salt), this.#meta.iterations);
    try {
      await open(currentKey, sealed!);
    } catch {
      return false;
    }
    const meta = newMeta();
    const key = await deriveKey(next, fromB64(meta.salt), meta.iterations);
    await idbSetMany({ vault: await seal(key, this.#data()), meta });
    this.#key = key;
    this.#meta = meta;
    this.revision++; // other devices pick up the new password on next sync
    return true;
  }

  has(id: string): boolean {
    return this.entries.some((e) => e.id === id);
  }

  async save(entry: Entry) {
    const now = Date.now();
    const index = this.entries.findIndex((e) => e.id === entry.id);
    if (index >= 0) this.entries[index] = { ...entry, updatedAt: now };
    else this.entries.push({ ...entry, createdAt: now, updatedAt: now });
    await this.#commit();
  }

  async remove(id: string) {
    this.entries = this.entries.filter((e) => e.id !== id);
    this.#tombstones[id] = Date.now();
    await this.#commit();
  }

  async toggleFavorite(id: string) {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return;
    entry.favorite = !entry.favorite;
    entry.updatedAt = Date.now();
    await this.#commit();
  }

  /** Merges entries from a backup or CSV import; newer edits win on id conflicts. */
  async importEntries(incoming: Entry[]): Promise<MergeResult> {
    const now = Date.now();
    const stamped = incoming.map((e) => {
      if (e.id in this.#tombstones) {
        // Deliberately restoring a deleted entry: make it strictly newer than the deletion so
        // sync keeps it, even if the deletion came from a device whose clock runs ahead.
        const updatedAt = Math.max(now, this.#tombstones[e.id] + 1);
        delete this.#tombstones[e.id];
        return { ...e, updatedAt };
      }
      return e.updatedAt ? e : { ...e, createdAt: now, updatedAt: now };
    });
    const result = mergeEntries($state.snapshot(this.entries), stamped);
    this.entries = result.entries;
    await this.#commit();
    return result;
  }

  /** Backup JSON, decryptable with the current master password. */
  async exportBackup(): Promise<string> {
    if (!this.#key || !this.#meta) throw new Error('Vault is locked.');
    return createBackup(this.#key, this.#meta, this.#data());
  }

  /**
   * Two-way sync with a remote copy (the text of a vault file, or null if there is none yet).
   * Never overwrites a remote copy it can't decrypt: throws RemotePasswordRequired instead.
   */
  async sync(remoteText: string | null, write: (text: string) => Promise<void>): Promise<SyncResult> {
    if (!this.#key || !this.#meta) throw new Error('Vault is locked.');
    let remote: VaultData = { entries: [], tombstones: {} };
    if (remoteText) {
      const file = parseBackup(remoteText);
      if (!file) throw new Error('The Google Drive copy is not a Lockbox vault.');
      const sameKey = file.kdf.salt === this.#meta.salt && file.kdf.iterations === this.#meta.iterations;
      const data = sameKey ? await openVaultFile(file, this.#key) : null;
      if (!data) throw new RemotePasswordRequired(file);
      remote = data;
    }

    const result = syncMerge(this.#data(), remote);
    this.entries = result.data.entries;
    this.#tombstones = result.data.tombstones;
    await this.#persist();
    await write(await createBackup(this.#key, this.#meta, result.data));
    return result;
  }

  /**
   * Switches this device to the master password of a remote vault file, so the two can sync.
   * Resolves false if the password doesn't open the file.
   */
  async adoptRemotePassword(password: string, file: BackupFile): Promise<boolean> {
    if (!this.#key) throw new Error('Vault is locked.');
    const key = await backupKey(file, password);
    if (!(await openVaultFile(file, key))) return false;
    const meta: VaultMeta = { version: 1, salt: file.kdf.salt, iterations: file.kdf.iterations };
    await idbSetMany({ vault: await seal(key, this.#data()), meta });
    this.#key = key;
    this.#meta = meta;
    return true;
  }

  #data(): VaultData {
    return { entries: $state.snapshot(this.entries), tombstones: { ...this.#tombstones } };
  }

  async #commit() {
    await this.#persist();
    this.revision++;
  }

  async #persist() {
    if (!this.#key) throw new Error('Vault is locked.');
    await idbSet('vault', await seal(this.#key, this.#data()));
  }
}

export const vault = new Vault();
