<script lang="ts">
  import { driveSync } from '../lib/drive-sync.svelte';
  import Icon from './Icon.svelte';

  let { onopensettings }: { onopensettings: () => void } = $props();

  const label = $derived(
    {
      off: '',
      idle: 'Sync with Google Drive',
      syncing: 'Syncing…',
      ok: `Synced · ${driveSync.message}`,
      signin: 'Tap to sign in to Google Drive',
      password: 'Google Drive vault needs its master password',
      error: `Sync failed: ${driveSync.message}`,
    }[driveSync.status],
  );

  function onclick() {
    // The password prompt lives in Settings; everything else is a "sync now".
    if (driveSync.status === 'password') onopensettings();
    else driveSync.run(true);
  }
</script>

<button class="icon-btn sync {driveSync.status}" {onclick} title={label} aria-label={label}>
  <Icon name={['signin', 'password', 'error'].includes(driveSync.status) ? 'cloudAlert' : 'cloud'} />
  {#if driveSync.status === 'syncing'}<span class="dot"></span>{/if}
</button>

<style>
  .sync {
    position: relative;
  }
  .sync.ok {
    color: var(--teal-400);
  }
  .sync.signin,
  .sync.password {
    color: #f59e0b;
  }
  .sync.error {
    color: var(--danger);
  }
  .sync.syncing {
    color: var(--purple-400);
  }
  .dot {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--teal-400);
    animation: pulse 1s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.25;
    }
  }
</style>
