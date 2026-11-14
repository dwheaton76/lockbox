<script lang="ts">
  import { MIN_MASTER_LENGTH as MIN_LENGTH, vault } from '../lib/vault.svelte';
  import Icon from './Icon.svelte';

  const creating = $derived(vault.status === 'new');

  let master = $state('');
  let confirm = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    if (creating && master.length < MIN_LENGTH) return (error = `Use at least ${MIN_LENGTH} characters.`);
    if (creating && master !== confirm) return (error = 'Passwords do not match.');

    busy = true;
    try {
      if (creating) await vault.create(master);
      else if (!(await vault.unlock(master))) error = 'Incorrect master password.';
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
      master = confirm = '';
    }
  }

  async function biometricUnlock() {
    error = '';
    busy = true;
    try {
      await vault.unlockWithBiometric();
    } catch (err) {
      // NotAllowedError = the user dismissed the system prompt (or it timed out).
      error = (err as Error).name === 'NotAllowedError' ? 'Cancelled. Try again or use your master password.' : (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<div class="wrap">
  <form class="panel" onsubmit={submit}>
    <div class="logo"><Icon name="shield" size={34} /></div>
    <h1>Lockbox</h1>
    <p class="muted">
      {#if creating}
        Create a master password. It encrypts your vault on this device and <strong>cannot be recovered</strong>.
      {:else if vault.biometric}
        Unlock with your fingerprint or face, or with your master password.
      {:else}
        Enter your master password to unlock your vault.
      {/if}
    </p>

    {#if !creating && vault.biometric}
      <button type="button" class="btn btn-primary bio" onclick={biometricUnlock} disabled={busy}>
        <Icon name="fingerprint" size={22} /> Unlock with fingerprint / Face ID
      </button>
      <div class="or"><span>or</span></div>
    {/if}

    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="input"
      type="password"
      placeholder="Master password"
      autocomplete={creating ? 'new-password' : 'current-password'}
      bind:value={master}
      autofocus={!vault.biometric}
    />
    {#if creating}
      <input
        class="input"
        type="password"
        placeholder="Confirm master password"
        autocomplete="new-password"
        bind:value={confirm}
      />
    {/if}

    {#if error}<p class="error">{error}</p>{/if}

    <button class="btn" class:btn-primary={!vault.biometric || creating} disabled={busy || !master}>
      <Icon name="lock" size={18} />
      {busy ? 'Unlocking…' : creating ? 'Create vault' : 'Unlock with password'}
    </button>
  </form>
</div>

<style>
  .bio {
    min-height: 52px;
    font-size: 1rem;
  }
  .or {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--muted);
    font-size: 0.8rem;
  }
  .or::before,
  .or::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }
  .wrap {
    display: grid;
    place-items: center;
    min-height: 100dvh;
    padding: 1.5rem;
  }
  .panel {
    display: grid;
    gap: 0.85rem;
    width: min(400px, 100%);
    padding: 2rem 1.5rem;
    border: 1px solid var(--border);
    border-radius: 24px;
    background: var(--surface);
    backdrop-filter: blur(16px);
    box-shadow: var(--shadow);
    text-align: center;
  }
  .logo {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    margin: 0 auto 0.25rem;
    border-radius: 20px;
    background: var(--grad);
    color: #fff;
    box-shadow: 0 12px 30px -10px rgba(124, 58, 237, 0.9);
  }
  h1 {
    margin: 0;
    font-size: 1.75rem;
    letter-spacing: -0.02em;
    background: var(--grad);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  p {
    margin: 0 0 0.5rem;
  }
  .error {
    margin: 0;
    color: var(--danger);
    font-size: 0.9rem;
  }
</style>
