<script lang="ts">
  import { vault } from '../lib/vault.svelte';
  import { KINDS, KIND_LIST, blankEntry } from '../lib/kinds';
  import { matches, sortEntries } from '../lib/search';
  import type { Entry, EntryKind } from '../lib/types';
  import Icon from './Icon.svelte';
  import EntryCard from './EntryCard.svelte';
  import EntryEditor from './EntryEditor.svelte';
  import Generator from './Generator.svelte';
  import Settings from './Settings.svelte';
  import SyncButton from './SyncButton.svelte';
  import { driveSync } from '../lib/drive-sync.svelte';

  let query = $state('');
  let filter = $state<EntryKind | 'all'>('all');
  // Raw (non-proxied): the editor makes its own copy; only open/close needs to be reactive.
  let editing = $state.raw<Entry | null>(null);
  let showGenerator = $state(false);
  let showSettings = $state(false);
  let searchInput: HTMLInputElement;

  const visible = $derived(
    sortEntries(vault.entries.filter((e) => (filter === 'all' || e.kind === filter) && matches(e, query))),
  );
  const counts = $derived(
    Object.fromEntries(KIND_LIST.map((k) => [k, vault.entries.filter((e) => e.kind === k).length])) as Record<
      EntryKind,
      number
    >,
  );

  function onKeydown(event: KeyboardEvent) {
    const typing = (event.target as HTMLElement).closest('input, textarea, dialog');
    if ((event.key === 'k' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !typing)) {
      event.preventDefault();
      searchInput.focus();
    }
  }

  // Sync right after unlock, then a couple of seconds after each change.
  let firstSync = true;
  $effect(() => {
    void vault.revision;
    if (!driveSync.enabled) return;
    const timer = setTimeout(() => driveSync.run(false), firstSync ? 0 : 2000);
    firstSync = false;
    return () => clearTimeout(timer);
  });

  function newEntry() {
    editing = blankEntry(filter === 'all' ? 'password' : filter);
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="shell">
  <header>
    <div class="bar">
      <div class="brand">
        <span class="mark"><Icon name="shield" size={18} /></span>
        Lockbox
      </div>
      <div class="actions">
        <button class="icon-btn accent" onclick={() => (showGenerator = true)} title="Generator" aria-label="Open generator">
          <Icon name="wand" />
        </button>
        {#if driveSync.enabled}
          <SyncButton onopensettings={() => (showSettings = true)} />
        {/if}
        <button class="icon-btn" onclick={() => (showSettings = true)} title="Settings" aria-label="Open settings">
          <Icon name="settings" />
        </button>
        <button class="icon-btn" onclick={() => vault.lock()} title="Lock" aria-label="Lock vault">
          <Icon name="lock" />
        </button>
      </div>
    </div>

    <label class="search">
      <Icon name="search" size={18} />
      <input
        bind:this={searchInput}
        bind:value={query}
        type="search"
        placeholder="Search vault…  (#tag to filter)"
        aria-label="Search vault"
        autocomplete="off"
        spellcheck="false"
        onkeydown={(e) => e.key === 'Escape' && (query = '')}
      />
      <kbd>Ctrl K</kbd>
    </label>

    <nav class="tabs" aria-label="Filter by type">
      <button class:active={filter === 'all'} onclick={() => (filter = 'all')}>
        All <span>{vault.entries.length}</span>
      </button>
      {#each KIND_LIST as kind (kind)}
        <button class:active={filter === kind} onclick={() => (filter = kind)}>
          <Icon name={KINDS[kind].icon} size={15} />
          {KINDS[kind].plural} <span>{counts[kind]}</span>
        </button>
      {/each}
    </nav>
  </header>

  <main>
    {#each visible as entry (entry.id)}
      <EntryCard {entry} onedit={() => (editing = $state.snapshot(entry) as Entry)} />
    {:else}
      <div class="empty">
        <div class="empty-icon"><Icon name={query ? 'search' : 'key'} size={28} /></div>
        {#if query}
          <p>No matches for “{query}”.</p>
        {:else}
          <p>Nothing here yet.</p>
          <div class="empty-actions">
            <button class="btn btn-primary" onclick={newEntry}><Icon name="plus" size={18} /> Add your first item</button>
            {#if !vault.entries.length}
              <button class="btn" onclick={() => (showSettings = true)}><Icon name="upload" size={18} /> Import passwords</button>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </main>

  <button class="fab" onclick={newEntry} aria-label="Add item"><Icon name="plus" size={26} /></button>
</div>

{#if editing}
  <EntryEditor entry={editing} onclose={() => (editing = null)} />
{/if}
{#if showGenerator}
  <Generator onclose={() => (showGenerator = false)} />
{/if}
{#if showSettings}
  <Settings onclose={() => (showSettings = false)} />
{/if}

<style>
  .shell {
    max-width: 780px;
    margin: 0 auto;
    padding: env(safe-area-inset-top) 1rem calc(6rem + env(safe-area-inset-bottom));
  }
  header {
    position: sticky;
    top: 0;
    z-index: 5;
    display: grid;
    gap: 0.75rem;
    padding: 0.85rem 0 0.75rem;
    background: linear-gradient(var(--bg) 80%, transparent);
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-weight: 800;
    font-size: 1.2rem;
    letter-spacing: -0.02em;
  }
  .mark {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 11px;
    background: var(--grad);
    color: #fff;
  }
  .actions {
    display: flex;
    gap: 0.25rem;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0 0.9rem;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    backdrop-filter: blur(12px);
    color: var(--muted);
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .search:focus-within {
    border-color: var(--teal-400);
    box-shadow: var(--ring);
  }
  .search input {
    flex: 1;
    min-width: 0;
    height: 48px;
    border: 0;
    background: transparent;
    outline: none;
    color: var(--text);
  }
  kbd {
    padding: 0.1rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-family: var(--mono);
    font-size: 0.72rem;
  }
  @media (hover: none) {
    kbd {
      display: none;
    }
  }

  .tabs {
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs button {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    flex: none;
    min-height: 36px;
    padding: 0 0.85rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--muted);
    font-weight: 600;
    font-size: 0.88rem;
  }
  .tabs button span {
    padding: 0 0.4rem;
    border-radius: 999px;
    background: var(--surface-2);
    font-size: 0.75rem;
  }
  .tabs button.active {
    border-color: transparent;
    background: var(--grad);
    color: #fff;
  }
  .tabs button.active span {
    background: rgba(255, 255, 255, 0.2);
  }

  main {
    display: grid;
    gap: 0.6rem;
    padding-top: 0.25rem;
  }

  .empty {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    padding: 4rem 1rem;
    color: var(--muted);
    text-align: center;
  }
  .empty p {
    margin: 0 0 0.5rem;
  }
  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }
  .empty-icon {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    border-radius: 20px;
    background: var(--grad-soft);
    color: var(--teal-400);
  }

  .fab {
    position: fixed;
    right: max(1.25rem, calc(50vw - 390px + 1rem));
    bottom: calc(1.25rem + env(safe-area-inset-bottom));
    display: grid;
    place-items: center;
    width: 60px;
    height: 60px;
    border: 0;
    border-radius: 20px;
    background: var(--grad);
    color: #fff;
    box-shadow: 0 14px 30px -10px rgba(124, 58, 237, 0.9);
    transition: transform 0.15s;
  }
  .fab:hover {
    transform: translateY(-2px) rotate(90deg);
  }
</style>
