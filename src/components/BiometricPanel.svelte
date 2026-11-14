<script lang="ts">
  import { onMount } from 'svelte';
  import { vault } from '../lib/vault.svelte';
  import { biometricAvailable } from '../lib/biometric';
  import { toast } from '../lib/toast.svelte';
  import Icon from './Icon.svelte';

  let available = $state<boolean | null>(null);
  let busy = $state(false);
  let error = $state('');

  onMount(async () => {
    available = await biometricAvailable();
  });

  async function turnOn() {
    busy = true;
    error = '';
    try {
      await vault.enableBiometric();
      toast.show('Fingerprint / Face ID unlock is on');
    } catch (err) {
      error = (err as Error).name === 'NotAllowedError' ? 'Setup was cancelled.' : (err as Error).message;
    } finally {
      busy = false;
    }
  }

  async function turnOff() {
    await vault.disableBiometric();
    toast.show('Fingerprint / Face ID unlock is off');
  }
</script>

<section>
  <h3><Icon name="fingerprint" size={18} /> Fingerprint / Face ID unlock</h3>

  {#if available === false}
    <p class="muted">This device or browser doesn't offer fingerprint, face or device-PIN sign-in to websites.</p>
  {:else if vault.biometric}
    <p class="muted">On for this device. Your master password still works, and is needed after you change it.</p>
    <div class="row"><button class="btn btn-danger" onclick={turnOff}>Turn off</button></div>
  {:else}
    <p class="muted">
      Unlock this device with your fingerprint, face or device PIN instead of typing your master password. Your vault
      key is encrypted with a secret only this device's authenticator can produce, and it never leaves this device. The
      setup adds a "Lockbox vault unlock" passkey to this device.
    </p>
    {#if error}<p class="error">{error}</p>{/if}
    <div class="row">
      <button class="btn btn-primary" onclick={turnOn} disabled={busy || available === null}>
        <Icon name="fingerprint" size={18} />
        {busy ? 'Waiting for your device…' : 'Turn on'}
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
  .row {
    display: flex;
    justify-content: flex-end;
  }
  .error {
    color: var(--danger);
    font-size: 0.9rem;
  }
</style>
