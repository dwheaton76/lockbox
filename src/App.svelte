<script lang="ts">
  import { onMount } from 'svelte';
  import { AUTO_LOCK_MS, BACKGROUND_LOCK_MS, vault } from './lib/vault.svelte';
  import Unlock from './components/Unlock.svelte';
  import VaultView from './components/VaultView.svelte';
  import Toast from './components/Toast.svelte';

  onMount(() => {
    vault.init();
  });

  // Auto-lock after inactivity, or after the app has been in the background for a while.
  $effect(() => {
    if (vault.status !== 'unlocked') return;
    let timer: ReturnType<typeof setTimeout>;
    let hiddenAt = 0;
    const lockIn = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => vault.lock(), ms);
    };
    const onActivity = () => lockIn(AUTO_LOCK_MS);
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        lockIn(BACKGROUND_LOCK_MS);
      } else if (Date.now() - hiddenAt >= BACKGROUND_LOCK_MS) {
        // Phones suspend timers in the background, so check elapsed time on return.
        vault.lock();
      } else {
        onActivity();
      }
    };

    const events = ['pointerdown', 'keydown', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    onActivity();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });
</script>

{#if vault.status === 'loading'}
  <div class="splash"><span class="spinner"></span></div>
{:else if vault.status === 'unlocked'}
  <VaultView />
{:else}
  <Unlock />
{/if}

<Toast />

<style>
  .splash {
    display: grid;
    place-items: center;
    min-height: 100dvh;
  }
  .spinner {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 3px solid var(--surface-2);
    border-top-color: var(--teal-400);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
