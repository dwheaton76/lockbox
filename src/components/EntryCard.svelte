<script lang="ts">
  import { vault } from '../lib/vault.svelte';
  import { KINDS, getField, subtitleOf } from '../lib/kinds';
  import { copy } from '../lib/clipboard';
  import { toast } from '../lib/toast.svelte';
  import type { Entry, FieldDef } from '../lib/types';
  import Icon from './Icon.svelte';

  let { entry, onedit }: { entry: Entry; onedit: () => void } = $props();

  let open = $state(false);
  let revealed = $state<Record<string, boolean>>({});

  const kind = $derived(KINDS[entry.kind]);
  // Schema fields and custom fields share one row shape for rendering.
  type Row = { id: string; label: string; value: string } & Pick<FieldDef, 'secret' | 'mono' | 'multiline' | 'type'>;
  const rows = $derived<Row[]>([
    ...kind.fields.map((f) => ({ ...f, id: f.key, value: getField(entry, f.key) })),
    ...entry.custom.map((f) => ({ ...f, label: f.label || 'Custom field', mono: f.secret })),
  ].filter((r) => r.value));
  const primaryValue = $derived(getField(entry, kind.primary));

  function linkFor(row: Row): string | null {
    if (row.type === 'url') return /^https?:\/\//i.test(row.value) ? row.value : `https://${row.value}`;
    if (row.type === 'email') return `mailto:${row.value}`;
    if (row.type === 'tel') return `tel:${row.value.replace(/[^\d+]/g, '')}`;
    return null;
  }

  async function remove() {
    if (!confirm(`Delete “${entry.title || 'Untitled'}”? This cannot be undone.`)) return;
    await vault.remove(entry.id);
    toast.show('Deleted');
  }
</script>

<article class="card" class:open>
  <div class="head">
    <button class="summary" onclick={() => (open = !open)} aria-expanded={open}>
      <span class="avatar {entry.kind}"><Icon name={kind.icon} /></span>
      <span class="titles">
        <strong>
          {entry.title || 'Untitled'}
          {#if entry.favorite}<span class="fav"><Icon name="star" size={13} /></span>{/if}
        </strong>
        <small>{subtitleOf(entry) || kind.label}</small>
      </span>
    </button>
    {#if primaryValue}
      <button
        class="icon-btn accent"
        onclick={() => copy(primaryValue, { secret: true, label: `${kind.label} copied` })}
        title="Copy {kind.label.toLowerCase()}"
        aria-label="Copy {kind.label.toLowerCase()}"
      >
        <Icon name="copy" size={18} />
      </button>
    {/if}
    <button class="icon-btn chevron" onclick={() => (open = !open)} aria-label="Toggle details">
      <Icon name="chevron" size={18} />
    </button>
  </div>

  {#if open}
    <div class="body">
      {#each rows as row (row.id)}
        {@const link = linkFor(row)}
        <div class="field">
          <span class="label">{row.label}</span>
          <div class="row">
            <span class="value" class:mono={row.mono} class:wrap={row.multiline}>
              {row.secret && !revealed[row.id] ? '•'.repeat(12) : row.value}
            </span>
            {#if link}
              <a class="icon-btn" href={link} target="_blank" rel="noopener noreferrer" aria-label="Open {row.label}">
                <Icon name="external" size={17} />
              </a>
            {/if}
            {#if row.secret}
              <button
                class="icon-btn"
                onclick={() => (revealed[row.id] = !revealed[row.id])}
                aria-label={revealed[row.id] ? 'Hide' : 'Reveal'}
              >
                <Icon name={revealed[row.id] ? 'eyeOff' : 'eye'} size={17} />
              </button>
            {/if}
            <button
              class="icon-btn"
              onclick={() => copy(row.value, { secret: row.secret, label: `${row.label} copied` })}
              aria-label="Copy {row.label}"
            >
              <Icon name="copy" size={17} />
            </button>
          </div>
        </div>
      {/each}

      {#if entry.tags.length}
        <div class="tags">
          {#each entry.tags as tag (tag)}<span>#{tag}</span>{/each}
        </div>
      {/if}
      {#if entry.notes}<p class="notes">{entry.notes}</p>{/if}

      <div class="toolbar">
        <button class="btn" onclick={() => vault.toggleFavorite(entry.id)}>
          <Icon name="star" size={16} />
          {entry.favorite ? 'Unfavorite' : 'Favorite'}
        </button>
        <button class="btn" onclick={onedit}><Icon name="edit" size={16} /> Edit</button>
        <button class="btn btn-danger" onclick={remove}><Icon name="trash" size={16} /> Delete</button>
      </div>
    </div>
  {/if}
</article>

<style>
  .card {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    backdrop-filter: blur(12px);
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .card:hover,
  .card.open {
    border-color: rgba(139, 92, 246, 0.4);
  }
  .card.open {
    box-shadow: var(--shadow);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 0.5rem 0.5rem 0.6rem;
  }
  .summary {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    flex: 1;
    min-width: 0;
    padding: 0.2rem;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    text-align: left;
  }
  .avatar {
    display: grid;
    place-items: center;
    flex: none;
    width: 42px;
    height: 42px;
    border-radius: 12px;
    color: #fff;
  }
  .avatar.password {
    background: linear-gradient(135deg, var(--purple-500), var(--purple-700));
  }
  .avatar.account {
    background: linear-gradient(135deg, var(--purple-400), var(--teal-500));
  }
  .avatar.passkey {
    background: linear-gradient(135deg, var(--teal-400), #0f766e);
  }
  .avatar.apikey {
    background: var(--grad);
  }
  .titles {
    display: grid;
    min-width: 0;
  }
  .titles strong,
  .titles small {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .titles small {
    color: var(--muted);
  }
  .fav {
    color: #fbbf24;
    vertical-align: -1px;
  }
  .chevron :global(svg) {
    transition: transform 0.2s;
  }
  .open .chevron :global(svg) {
    transform: rotate(180deg);
  }

  .body {
    display: grid;
    gap: 0.6rem;
    padding: 0.25rem 1rem 1rem;
    animation: fade 0.18s ease-out;
  }
  @keyframes fade {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  .field {
    display: grid;
    gap: 0.15rem;
    padding: 0.5rem 0.25rem 0.5rem 0.75rem;
    border-radius: var(--radius-sm);
    background: var(--surface);
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
    gap: 0.1rem;
  }
  .value {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .value.wrap {
    white-space: normal;
    word-break: break-all;
    max-height: 6.5em;
    overflow-y: auto;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .tags span {
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    background: var(--grad-soft);
    color: var(--teal-300);
    font-size: 0.8rem;
    font-weight: 600;
  }
  .notes {
    margin: 0;
    color: var(--muted);
    white-space: pre-wrap;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding-top: 0.25rem;
  }
  .toolbar .btn {
    min-height: 38px;
    font-size: 0.88rem;
  }
</style>
