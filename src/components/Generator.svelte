<script lang="ts">
  import { onMount } from 'svelte';
  import {
    apiKeyEntropy,
    generateApiKey,
    generatePassword,
    loadPasswordOptions,
    passwordEntropy,
    savePasswordOptions,
    strengthOf,
  } from '../lib/generator';
  import { copy } from '../lib/clipboard';
  import Icon from './Icon.svelte';

  let { onclose }: { onclose: () => void } = $props();

  let dialog: HTMLDialogElement;
  let mode = $state<'password' | 'apikey'>('password');
  let opts = $state(loadPasswordOptions());
  let prefix = $state('sk');
  let keyLength = $state(40);
  let value = $state('');

  const bits = $derived(mode === 'password' ? passwordEntropy(opts) : apiKeyEntropy(keyLength));
  const strength = $derived(strengthOf(bits));

  const toggles = [
    ['lower', 'a–z'],
    ['upper', 'A–Z'],
    ['digits', '0–9'],
    ['symbols', '!@#'],
    ['avoidAmbiguous', 'No look-alikes'],
  ] as const;

  function regenerate() {
    value = mode === 'password' ? generatePassword(opts) : generateApiKey(prefix.trim(), keyLength);
  }

  onMount(() => dialog.showModal());
  // Re-generate whenever any option changes; persist password preferences.
  $effect(regenerate);
  $effect(() => savePasswordOptions(opts));

  function charClass(ch: string) {
    if (/[0-9]/.test(ch)) return 'd';
    if (/[^a-zA-Z_]/.test(ch)) return 's';
    return '';
  }
</script>

<dialog bind:this={dialog} class="sheet" {onclose}>
  <header class="sheet-head">
    <h2>Generator</h2>
    <button class="icon-btn" onclick={() => dialog.close()} aria-label="Close"><Icon name="x" /></button>
  </header>

  <div class="sheet-body">
    <div class="segmented">
      <button class:active={mode === 'password'} onclick={() => (mode = 'password')}><Icon name="key" size={16} /> Password</button>
      <button class:active={mode === 'apikey'} onclick={() => (mode = 'apikey')}><Icon name="code" size={16} /> API key</button>
    </div>

    <div class="output">
      <output class="mono" aria-live="polite">
        {#each value.split('') as ch, i (i)}<span class={charClass(ch)}>{ch}</span>{/each}
      </output>
      <div class="output-actions">
        <button class="icon-btn" onclick={regenerate} aria-label="Regenerate"><Icon name="refresh" /></button>
        <button class="btn btn-primary" onclick={() => copy(value, { secret: true })}><Icon name="copy" size={18} /> Copy</button>
      </div>
    </div>

    <div class="meter level-{strength.level}">
      <div class="track"><div class="fill" style:width="{strength.pct}%"></div></div>
      <span>{strength.label} · {bits} bits</span>
    </div>

    {#if mode === 'password'}
      <label class="slider">
        <span>Length <strong>{opts.length}</strong></span>
        <input type="range" min="8" max="64" bind:value={opts.length} />
      </label>
      <div class="chips">
        {#each toggles as [key, label] (key)}
          <label class="chip" class:on={opts[key]}>
            <input type="checkbox" bind:checked={opts[key]} />
            {label}
          </label>
        {/each}
      </div>
    {:else}
      <label class="slider">
        <span>Length <strong>{keyLength}</strong></span>
        <input type="range" min="16" max="96" bind:value={keyLength} />
      </label>
      <label class="prefix">
        <span>Prefix</span>
        <input class="input mono" bind:value={prefix} placeholder="sk, pk, live…" maxlength="12" />
      </label>
    {/if}
  </div>
</dialog>

<style>
  .output {
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
    border-radius: var(--radius);
    background: var(--grad-soft);
    border: 1px solid var(--border);
  }
  output {
    font-size: 1.15rem;
    line-height: 1.6;
    word-break: break-all;
    min-height: 3.2em;
  }
  output .d {
    color: var(--teal-400);
  }
  output .s {
    color: var(--purple-400);
  }
  .output-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .meter {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .track {
    flex: 1;
    height: 6px;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: inherit;
    transition: width 0.25s, background 0.25s;
  }
  .level-0 .fill {
    background: var(--danger);
  }
  .level-1 .fill {
    background: #f59e0b;
  }
  .level-2 .fill {
    background: var(--teal-500);
  }
  .level-3 .fill {
    background: var(--grad);
  }

  .slider,
  .prefix {
    display: grid;
    gap: 0.4rem;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .slider strong {
    color: var(--text);
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--teal-500);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    min-height: 38px;
    padding: 0 0.9rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--muted);
    font-weight: 600;
    font-size: 0.88rem;
    cursor: pointer;
    user-select: none;
  }
  .chip.on {
    border-color: transparent;
    background: var(--grad);
    color: #fff;
  }
  .chip:focus-within {
    box-shadow: var(--ring);
  }
  .chip input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
</style>
