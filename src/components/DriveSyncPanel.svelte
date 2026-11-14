<script lang="ts">
  import { driveSync } from '../lib/drive-sync.svelte';
  import { toast } from '../lib/toast.svelte';
  import Icon from './Icon.svelte';

  let remotePassword = $state('');
  let passwordError = $state('');
  let busy = $state(false);

  function ago(ts: number | null): string {
    if (!ts) return 'never';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    return new Date(ts).toLocaleString();
  }

  async function useRemotePassword(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    passwordError = '';
    try {
      if (await driveSync.useRemotePassword(remotePassword)) toast.show('Master password updated · synced');
      else passwordError = 'That password does not open your Google Drive vault.';
    } finally {
      busy = false;
      remotePassword = '';
    }
  }

  function disconnect() {
    if (!confirm('Stop syncing this device? Your vault stays on this device and in Google Drive.')) return;
    driveSync.disconnect();
    toast.show('Google Drive disconnected');
  }
</script>

<section>
  <h3><Icon name="cloud" size={18} /> Google Drive sync</h3>

  {#if !driveSync.configured}
    <p class="muted">
      Sync needs a Google OAuth client ID. Add <code>VITE_GOOGLE_CLIENT_ID</code> to <code>.env.local</code> (see the
      README) and restart the app.
    </p>
  {:else if !driveSync.enabled}
    <p class="muted">
      Keep this vault in sync across your devices. Only the encrypted vault is stored, in a hidden app folder that
      Lockbox alone can see. Google never sees your master password or your data.
    </p>
    <button class="btn btn-primary" onclick={() => driveSync.connect()}>
      <Icon name="cloud" size={18} /> Connect Google Drive
    </button>
  {:else}
    <p class="status {driveSync.status}">
      {#if driveSync.status === 'syncing'}
        Syncing…
      {:else if driveSync.status === 'ok'}
        Synced {ago(driveSync.lastSync)} · {driveSync.message}
      {:else if driveSync.status === 'error' || driveSync.status === 'signin'}
        {driveSync.message}
      {:else if driveSync.status === 'password'}
        Your Google Drive vault uses a different master password.
      {:else}
        Last synced {ago(driveSync.lastSync)}
      {/if}
    </p>

    {#if driveSync.status === 'password'}
      <form class="stack" onsubmit={useRemotePassword}>
        <p class="muted small">
          Enter the master password of your Google Drive vault (the one you use on your other devices). This device
          will switch to that password, and both copies will be merged.
        </p>
        <input
          class="input"
          type="password"
          placeholder="Google Drive vault master password"
          autocomplete="off"
          bind:value={remotePassword}
        />
        {#if passwordError}<p class="error">{passwordError}</p>{/if}
        <button class="btn btn-primary" disabled={busy || !remotePassword}>{busy ? 'Checking…' : 'Unlock & sync'}</button>
      </form>
    {/if}

    <div class="row">
      <button class="btn btn-danger" onclick={disconnect}>Disconnect</button>
      <button class="btn" onclick={() => driveSync.run(true)} disabled={driveSync.status === 'syncing'}>
        <Icon name="refresh" size={18} />
        {driveSync.status === 'signin' ? 'Sign in & sync' : 'Sync now'}
      </button>
    </div>
  {/if}
</section>

<style>
  section {
    display: grid;
    gap: 0.6rem;
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--grad-soft);
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
  code {
    font-family: var(--mono);
    font-size: 0.85em;
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
  .status.ok {
    color: var(--teal-300);
  }
  .status.signin,
  .status.password {
    color: #f59e0b;
  }
  .status.error,
  .error {
    color: var(--danger);
  }
</style>
