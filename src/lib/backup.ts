// Encrypted vault files: used for backups and for the Google Drive sync copy.
// A file is the sealed vault data plus the KDF parameters, so it opens with whatever
// master password was in use when it was written.
import { deriveKey, fromB64, open, seal, type KdfParams, type Sealed } from './crypto';
import { toVaultData, type VaultData } from './sync';
import type { Entry } from './types';

const FORMAT = 'lockbox-backup';
const MAX_ITERATIONS = 10_000_000; // refuse files that would hang the browser

export interface BackupFile {
  format: typeof FORMAT;
  version: 1;
  exportedAt: string;
  kdf: KdfParams;
  vault: Sealed;
}

export async function createBackup(key: CryptoKey, kdf: KdfParams, data: VaultData): Promise<string> {
  const file: BackupFile = {
    format: FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    kdf: { salt: kdf.salt, iterations: kdf.iterations },
    vault: await seal(key, data),
  };
  return JSON.stringify(file, null, 2);
}

/** Returns null if the text isn't a Lockbox vault file. */
export function parseBackup(text: string): BackupFile | null {
  try {
    const data = JSON.parse(text);
    const valid =
      data?.format === FORMAT &&
      typeof data.kdf?.salt === 'string' &&
      Number.isInteger(data.kdf?.iterations) &&
      typeof data.vault?.iv === 'string' &&
      typeof data.vault?.data === 'string';
    return valid ? (data as BackupFile) : null;
  } catch {
    return null;
  }
}

/** Derives the file's key from a password. Throws on unreasonable KDF settings. */
export async function backupKey(file: BackupFile, password: string): Promise<CryptoKey> {
  const { salt, iterations } = file.kdf;
  if (iterations < 1 || iterations > MAX_ITERATIONS) throw new Error('This backup uses unsupported settings.');
  return deriveKey(password, fromB64(salt), iterations);
}

/** Resolves null if the key doesn't match. */
export async function openVaultFile(file: BackupFile, key: CryptoKey): Promise<VaultData | null> {
  try {
    return toVaultData(await open(key, file.vault));
  } catch {
    return null;
  }
}

/** Resolves null on a wrong password. */
export async function openBackup(file: BackupFile, password: string): Promise<Entry[] | null> {
  return (await openVaultFile(file, await backupKey(file, password)))?.entries ?? null;
}
