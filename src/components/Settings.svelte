<script lang="ts">
  import { onMount } from 'svelte';
  import { AUTO_LOCK_MS, BACKGROUND_LOCK_MS, MIN_MASTER_LENGTH, vault } from '../lib/vault.svelte';
  import { importCsv } from '../lib/csv';
  import { openBackup, parseBackup, type BackupFile } from '../lib/backup';
  import { mergeEntries } from '../lib/merge';
  import { toast } from '../lib/toast.svelte';
  import type { Entry } from '../lib/types';
  import Icon from './Icon.svelte';
  import DriveSyncPanel from './DriveSyncPanel.svelte';
  import BiometricPanel from './BiometricPanel.svelte';

  let { onclose }: { onclose: () => void } = $props();

  let dialog: HTMLDialogElement;
  onMount(() => dialog.showModal());

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // ---------- Change master password ----------
  let current = $state('');
  let next = $state('');
  let confirmNext = $state('');
  let pwError = $state('');
  let pwBusy = $state(false);

  async function changePassword(event: SubmitEvent) {
    event.preventDefault();
    pwError = '';
    if (next.length < MIN_MASTER_LENGTH) return (pwError = `Use at least ${MIN_MASTER_LENGTH} characters.`);
    if (next !== confirmNext) return (pwError = 'New passwords do not match.');
    if (next === current) return (pwError = 'Choose a password different from the current one.');

    pwBusy = true;
    try {
      const hadBiometric = vault.biometric;
      if (await vault.changeMasterPassword(current, next)) {
        current = next = confirmNext = '';
        toast.show(hadBiometric ? 'Master password changed · turn fingerprint unlock back on below' : 'Master password changed', 4000);
      } else {
        pwError = 'Current master password is incorrect.';
      }
    } catch (err) {
      pwError = (err as Error).message;
    } finally {
      pwBusy = false;
    }
  }

  // ---------- Export ----------
  async function exportBackup() {
    const json = await vault.exportBackup();
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const name = `lockbox-backup-${new Date().toISOString().slice(0, 10)}.json`;
    Object.assign(document.createElement('a'), { href: url, download: name }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.show('Encrypted backup downloaded');
  }

  // ---------- Import ----------
  type Stage =
    | { step: 'idle' }
    | { step: 'password'; name: string; file: BackupFile }
    | {
        step: 'preview';
        name: string;
        source: 'csv' | 'backup';
        entries: Entry[];
        added: number;
        updated: number;
        duplicates: number;
        skipped: number;
      };

  let stage = $state.raw<Stage>({ step: 'idle' });
  let backupPassword = $state('');
  let importError = $state('');
  let importBusy = $state(false);
  let csvImported = $state(false);
  let fileInput: HTMLInputElement;

  async function onFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    importError = '';
    csvImported = false;

    const text = await file.text();
    const backup = parseBackup(text);
    if (backup) {
      stage = { step: 'password', name: file.name, file: backup };
      return;
    }
    try {
      const { entries, duplicates, skipped } = importCsv(text, vault.entries);
      stage = { step: 'preview', name: file.name, source: 'csv', entries, added: entries.length, updated: 0, duplicates, skipped };
    } catch (err) {
      importError = (err as Error).message;
    }
  }

  async function openBackupFile(event: SubmitEvent) {
    event.preventDefault();
    if (stage.step !== 'password') return;
    importBusy = true;
    importError = '';
    try {
      const entries = await openBackup(stage.file, backupPassword);
      if (!entries) {
        importError = 'Wrong password for this backup.';
        return;
      }
      const { added, updated, unchanged } = mergeEntries(vault.entries, entries);
      stage = { step: 'preview', name: stage.name, source: 'backup', entries, added, updated, duplicates: unchanged, skipped: 0 };
    } catch (err) {
      importError = (err as Error).message;
    } finally {
      importBusy = false;
      backupPassword = '';
    }
  }

  async function confirmImport() {
    if (stage.step !== 'preview') return;
    importBusy = true;
    try {
      const { added, updated } = await vault.importEntries(stage.entries);
      toast.show(`Imported ${plural(added + updated, 'item')}`);
      csvImported = stage.source === 'csv';
      stage = { step: 'idle' };
    } finally {
      importBusy = false;
    }
  }

  function cancelImport() {
    stage = { step: 'idle' };
    importError = '';
  }
</script>

<dialog bind:this={dialog} class="sheet" {onclose}>
  <header class="sheet-head">
    <h2>Settings</h2>
    <button class="icon-btn" onclick={() => dialog.close()} aria-label="Close"><Icon name="x" /></button>
  </header>

  <div class="sheet-body">
    <DriveSyncPanel />
    <BiometricPanel />

    <!-- Import -->
    <section>
      <h3><Icon name="upload" size={18} /> Import</h3>
      <p class="muted">
        Bring in passwords from a CSV export (Chrome, Edge, Firefox, Safari/iCloud, Bitwarden, 1Password, LastPass,
        KeePassXC) or a Lockbox backup. Logins already in your vault are skipped.
      </p>

      <input bind:this={fileInput} type="file" accept=".csv,.json,text/csv,application/json" onchange={onFile} hidden />
      {#if stage.step === 'idle'}
        <button class="btn" onclick={() => fileInput.click()}><Icon name="upload" size={18} /> Choose file…</button>
      {:else if stage.step === 'password'}
        <form class="stack" onsubmit={openBackupFile}>
          <p class="file">{stage.name}</p>
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="input"
            type="password"
            placeholder="Master password used when this backup was made"
            autocomplete="off"
            bind:value={backupPassword}
            autofocus
          />
          <div class="row">
            <button type="button" class="btn" onclick={cancelImport}>Cancel</button>
            <button class="btn btn-primary" disabled={importBusy || !backupPassword}>
              {importBusy ? 'Decrypting…' : 'Open backup'}
            </button>
          </div>
        </form>
      {:else}
        <div class="stack">
          <p class="file">{stage.name}</p>
          <ul class="summary">
            <li><strong>{plural(stage.added, 'new item')}</strong> to add</li>
            {#if stage.updated}<li>{plural(stage.updated, 'item')} newer than your copy will be updated</li>{/if}
            {#if stage.duplicates}
              <li>
                {stage.source === 'csv'
                  ? `${plural(stage.duplicates, 'duplicate login')} (already saved or repeated in the file)`
                  : `${plural(stage.duplicates, 'item')} already in your vault`} — skipped
              </li>
            {/if}
            {#if stage.skipped}<li>{plural(stage.skipped, 'row')} that aren't logins — skipped</li>{/if}
          </ul>
          <div class="row">
            <button class="btn" onclick={cancelImport}>Cancel</button>
            <button class="btn btn-primary" disabled={importBusy || !(stage.added + stage.updated)} onclick={confirmImport}>
              Import {plural(stage.added + stage.updated, 'item')}
            </button>
          </div>
        </div>
      {/if}

      {#if importError}<p class="error">{importError}</p>{/if}
      {#if csvImported}
        <p class="warn">
          <strong>Delete the CSV file now.</strong> It holds your passwords unencrypted. Empty your Downloads folder
          and trash too.
        </p>
      {/if}
    </section>

    <!-- Export -->
    <section>
      <h3><Icon name="download" size={18} /> Encrypted backup</h3>
      <p class="muted">
        Downloads your whole vault as an encrypted file. It opens with your <em>current</em> master password, even if
        you change it later. Use it to back up or to move your vault to another device.
      </p>
      <button class="btn" onclick={exportBackup}><Icon name="download" size={18} /> Export backup</button>
    </section>

    <!-- Change master password -->
    <section>
      <h3><Icon name="lock" size={18} /> Change master password</h3>
      <form class="stack" onsubmit={changePassword}>
        <input class="input" type="password" placeholder="Current master password" autocomplete="current-password" bind:value={current} />
        <input class="input" type="password" placeholder="New master password" autocomplete="new-password" bind:value={next} />
        <input class="input" type="password" placeholder="Confirm new master password" autocomplete="new-password" bind:value={confirmNext} />
        {#if pwError}<p class="error">{pwError}</p>{/if}
        <button class="btn btn-primary" disabled={pwBusy || !current || !next}>
          {pwBusy ? 'Re-encrypting…' : 'Change password'}
        </button>
      </form>
      <p class="muted small">Older backups still open with the password that was current when they were made.</p>
    </section>

    <!-- Auto-lock -->
    <section>
      <h3><Icon name="shield" size={18} /> Auto-lock</h3>
      <p class="muted">
        Locks after {AUTO_LOCK_MS / 60_000} minutes without activity, or {BACKGROUND_LOCK_MS / 1000} seconds after you
        switch to another app or tab.
      </p>
    </section>
  </div>
</dialog>

<style>
  section {
    display: grid;
    gap: 0.6rem;
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-size: 1rem;
  }
  h3 :global(svg) {
    color: var(--teal-400);
  }
  p {
    margin: 0;
  }
  .small {
    font-size: 0.85rem;
  }
  .stack {
    display: grid;
    gap: 0.6rem;
  }
  .row {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .file {
    font-family: var(--mono);
    font-size: 0.85rem;
    color: var(--muted);
    word-break: break-all;
  }
  .summary {
    margin: 0;
    padding-left: 1.2rem;
  }
  .error {
    color: var(--danger);
    font-size: 0.9rem;
  }
  .warn {
    padding: 0.7rem 0.9rem;
    border-radius: var(--radius-sm);
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.35);
    font-size: 0.9rem;
  }
</style>
