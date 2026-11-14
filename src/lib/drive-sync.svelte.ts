// Google Drive sync state and orchestration (UI-facing). The merge logic lives in
// vault.sync / sync.ts; this module handles sign-in, status and retries.
import { vault } from './vault.svelte';
import { AuthRequired, driveConfigured, forgetToken, readVaultFile, revokeToken, signIn, storedToken, writeVaultFile } from './gdrive';
import { RemotePasswordRequired, type SyncResult } from './sync';
import type { BackupFile } from './backup';

const PREFS_KEY = 'lockbox.sync';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'ok' | 'signin' | 'password' | 'error';

function loadPrefs(): { enabled: boolean; lastSync: number | null } {
  try {
    return { enabled: false, lastSync: null, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { enabled: false, lastSync: null };
  }
}

function describe(r: SyncResult): string {
  const parts = [r.added && `${r.added} added`, r.updated && `${r.updated} updated`, r.removed && `${r.removed} removed`];
  return parts.filter(Boolean).join(', ') || 'Up to date';
}

class DriveSync {
  readonly configured = driveConfigured();
  enabled = $state(loadPrefs().enabled);
  lastSync = $state<number | null>(loadPrefs().lastSync);
  status = $state<SyncStatus>(loadPrefs().enabled ? 'idle' : 'off');
  message = $state('');
  #pendingFile: BackupFile | null = null;
  #again = false;

  #savePrefs() {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ enabled: this.enabled, lastSync: this.lastSync }));
  }

  /**
   * Syncs now. `interactive` (from a click) may open Google sign-in; background syncs
   * never do, and instead flag that sign-in is needed.
   */
  async run(interactive = false): Promise<void> {
    if (!this.enabled || vault.status !== 'unlocked') return;
    if (this.status === 'syncing') {
      this.#again = true;
      return;
    }

    let token = storedToken();
    if (!token) {
      if (!interactive) {
        this.status = 'signin';
        this.message = 'Sign in to Google Drive to sync.';
        return;
      }
      try {
        token = await signIn(); // no awaits before this line, so the popup isn't blocked
      } catch (err) {
        this.#fail(err);
        return;
      }
    }

    this.status = 'syncing';
    try {
      const remote = await readVaultFile(token);
      const result = await vault.sync(remote?.text ?? null, (text) => writeVaultFile(token, remote?.id ?? null, text));
      this.lastSync = Date.now();
      this.#savePrefs();
      this.status = 'ok';
      this.message = describe(result);
    } catch (err) {
      this.#fail(err);
    }

    if (this.#again) {
      this.#again = false;
      await this.run(false);
    }
  }

  #fail(err: unknown) {
    if (err instanceof RemotePasswordRequired) {
      this.#pendingFile = err.file;
      this.status = 'password';
    } else if (err instanceof AuthRequired) {
      this.status = 'signin';
    } else {
      this.status = 'error';
    }
    this.message = (err as Error).message;
  }

  /** Turn sync on and run the first sync. Call from a click handler. */
  connect(): Promise<void> {
    this.enabled = true;
    this.status = 'idle';
    this.#savePrefs();
    return this.run(true);
  }

  /** Answer a RemotePasswordRequired: switch this device to the Drive vault's master password. */
  async useRemotePassword(password: string): Promise<boolean> {
    if (!this.#pendingFile) return false;
    if (!(await vault.adoptRemotePassword(password, this.#pendingFile))) return false;
    this.#pendingFile = null;
    this.status = 'idle';
    await this.run(false);
    return true;
  }

  disconnect() {
    const token = storedToken();
    if (token) revokeToken(token);
    forgetToken();
    this.enabled = false;
    this.lastSync = null;
    this.status = 'off';
    this.message = '';
    this.#pendingFile = null;
    this.#savePrefs();
  }
}

export const driveSync = new DriveSync();
