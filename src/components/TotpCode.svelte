<script lang="ts">
  import { parseTotp, secondsRemaining, totpCode } from '../lib/totp';
  import { copy } from '../lib/clipboard';
  import Icon from './Icon.svelte';

  let { secret }: { secret: string } = $props();

  const params = $derived(parseTotp(secret));
  let code = $state('');
  let remaining = $state(0);

  // Tick every second; only recompute the code when the time window rolls over.
  $effect(() => {
    const p = params;
    if (!p) return;
    let window = -1;
    let cancelled = false;
    const tick = async () => {
      const now = Date.now();
      remaining = secondsRemaining(p.period, now);
      const current = Math.floor(now / 1000 / p.period);
      if (current === window) return;
      window = current;
      const next = await totpCode(p, now);
      if (!cancelled) code = next;
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  });

  const display = $derived(code.length % 2 === 0 ? `${code.slice(0, code.length / 2)} ${code.slice(code.length / 2)}` : code);
  const CIRCUMFERENCE = 2 * Math.PI * 9;
  const offset = $derived(params ? CIRCUMFERENCE * (1 - remaining / params.period) : 0);
</script>

<div class="totp">
  <span class="label">2FA code</span>
  {#if params}
    <div class="row">
      <span class="code" class:expiring={remaining <= 5} aria-live="polite">{display}</span>
      <svg class="ring" class:expiring={remaining <= 5} viewBox="0 0 24 24" aria-label="{remaining} seconds left">
        <circle cx="12" cy="12" r="9" class="track" />
        <circle cx="12" cy="12" r="9" class="fill" stroke-dasharray={CIRCUMFERENCE} stroke-dashoffset={offset} />
        <text x="12" y="15.5" text-anchor="middle">{remaining}</text>
      </svg>
      <button class="icon-btn accent" onclick={() => copy(code, { secret: true, label: '2FA code copied' })} aria-label="Copy 2FA code">
        <Icon name="copy" size={17} />
      </button>
    </div>
  {:else}
    <p class="invalid">The saved 2FA secret isn't a valid authenticator key. Edit this item to fix it.</p>
  {/if}
</div>

<style>
  .totp {
    display: grid;
    gap: 0.15rem;
    padding: 0.55rem 0.25rem 0.55rem 0.75rem;
    border-radius: var(--radius-sm);
    background: var(--grad-soft);
    border: 1px solid var(--border);
  }
  .label {
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .code {
    flex: 1;
    font-family: var(--mono);
    font-size: 1.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--teal-300);
    transition: color 0.3s;
  }
  .code.expiring {
    color: #f59e0b;
  }
  .ring {
    width: 34px;
    height: 34px;
    flex: none;
    transform: rotate(-90deg);
  }
  .ring circle {
    fill: none;
    stroke-width: 2.5;
  }
  .ring .track {
    stroke: var(--surface-2);
  }
  .ring .fill {
    stroke: var(--teal-400);
    stroke-linecap: round;
    transition: stroke-dashoffset 1s linear, stroke 0.3s;
  }
  .ring.expiring .fill {
    stroke: #f59e0b;
  }
  .ring text {
    transform: rotate(90deg);
    transform-origin: center;
    fill: var(--muted);
    font-size: 8px;
    font-family: var(--mono);
  }
  .invalid {
    margin: 0;
    color: var(--danger);
    font-size: 0.85rem;
  }
</style>
