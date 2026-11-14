<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { vault } from '../lib/vault.svelte';
  import { KINDS, KIND_LIST, blankCustomField, blankEntry, getField, setField } from '../lib/kinds';
  import { generateApiKey, generatePasskeyCredential, generatePassword, loadPasswordOptions } from '../lib/generator';
  import { paste } from '../lib/clipboard';
  import { toast } from '../lib/toast.svelte';
  import type { Entry, EntryKind, FieldDef } from '../lib/types';
  import Icon from './Icon.svelte';

  let { entry, onclose }: { entry: Entry; onclose: () => void } = $props();

  let dialog: HTMLDialogElement;
  // The editor works on a private copy taken once at open; the vault only changes on save.
  const initial = untrack(() => entry);
  // $state.snapshot deep-copies and unwraps reactive proxies (structuredClone throws on them).
  let draft = $state<Entry>($state.snapshot(initial) as Entry);
  let tagText = $state(initial.tags.join(', '));
  let revealed = $state<Record<string, boolean>>({});
  let saving = $state(false);

  const isNew = !vault.has(initial.id);
  const kind = $derived(KINDS[draft.kind]);

  onMount(() => dialog.showModal());

  const PRESETS: [label: string, secret: boolean][] = [
    ['Member ID', false],
    ['Routing number', false],
    ['Recovery codes', true],
    ['Security answer', true],
  ];

  function setKind(next: EntryKind) {
    draft = { ...blankEntry(next), id: draft.id, title: draft.title, notes: draft.notes, custom: draft.custom };
  }

  async function pasteInto(apply: (text: string) => void) {
    const text = await paste();
    if (text !== null) apply(text.trim());
  }

  function addCustom(label = '', secret = false) {
    draft.custom.push(blankCustomField(label, secret));
  }

  function generate(f: FieldDef) {
    const value = f.generator === 'password' ? generatePassword(loadPasswordOptions()) : generateApiKey();
    setField(draft, f.key, value);
    revealed[f.key] = true;
  }

  async function generatePasskey() {
    Object.assign(draft, await generatePasskeyCredential());
    toast.show('New P-256 key pair generated');
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    saving = true;
    try {
      draft.tags = [...new Set(tagText.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean))];
      draft.custom = draft.custom.filter((f) => f.label.trim() || f.value.trim());
      await vault.save($state.snapshot(draft) as Entry);
      toast.show(isNew ? 'Added to vault' : 'Saved');
      dialog.close();
    } finally {
      saving = false;
    }
  }
</script>

<dialog bind:this={dialog} class="sheet" {onclose}>
  <form onsubmit={save}>
    <header class="sheet-head">
      <h2>{isNew ? 'New' : 'Edit'} {kind.label.toLowerCase()}</h2>
      <button type="button" class="icon-btn" onclick={() => dialog.close()} aria-label="Close"><Icon name="x" /></button>
    </header>

    <div class="sheet-body">
      {#if isNew}
        <div class="segmented" role="tablist">
          {#each KIND_LIST as k (k)}
            <button type="button" role="tab" aria-selected={draft.kind === k} class:active={draft.kind === k} onclick={() => setKind(k)}>
              <Icon name={KINDS[k].icon} size={16} />
              {KINDS[k].label}
            </button>
          {/each}
        </div>
      {/if}

      <div class="field">
        <label for="f-title">Title</label>
        <input id="f-title" class="input" bind:value={draft.title} required placeholder="e.g. GitHub" />
      </div>

      {#each kind.fields as f (f.key)}
        {@const masked = f.secret && !revealed[f.key]}
        <div class="field">
          <label for="f-{f.key}">{f.label}</label>
          <div class="group">
            {#if f.multiline}
              <textarea
                id="f-{f.key}"
                class="input"
                class:mono={f.mono}
                class:masked
                rows="3"
                spellcheck="false"
                placeholder={f.placeholder}
                bind:value={() => getField(draft, f.key), (v) => setField(draft, f.key, v)}
              ></textarea>
            {:else}
              <input
                id="f-{f.key}"
                class="input"
                class:mono={f.mono}
                type={masked ? 'password' : (f.type ?? 'text')}
                autocomplete="off"
                spellcheck="false"
                placeholder={f.placeholder}
                bind:value={() => getField(draft, f.key), (v) => setField(draft, f.key, v)}
              />
            {/if}
            <div class="tools">
              {#if f.secret}
                <button type="button" class="icon-btn" onclick={() => (revealed[f.key] = !revealed[f.key])} aria-label="Toggle visibility">
                  <Icon name={masked ? 'eye' : 'eyeOff'} size={18} />
                </button>
              {/if}
              {#if f.generator}
                <button type="button" class="icon-btn accent" onclick={() => generate(f)} title="Generate" aria-label="Generate {f.label}">
                  <Icon name="wand" size={18} />
                </button>
              {/if}
              <button
                type="button"
                class="icon-btn"
                onclick={() => pasteInto((t) => setField(draft, f.key, t))}
                title="Paste"
                aria-label="Paste into {f.label}"
              >
                <Icon name="paste" size={18} />
              </button>
            </div>
          </div>
        </div>
      {/each}

      {#if draft.kind === 'passkey'}
        <button type="button" class="btn" onclick={generatePasskey}>
          <Icon name="wand" size={18} /> Generate ES256 key pair &amp; IDs
        </button>
      {/if}

      <section class="field" aria-labelledby="custom-heading">
        <span id="custom-heading" class="section-label">Additional details</span>
        {#each draft.custom as cf, i (cf.id)}
          {@const masked = cf.secret && !revealed[cf.id]}
          <div class="custom">
            <div class="custom-head">
              <input class="input label-input" placeholder="Label (e.g. Member ID)" bind:value={cf.label} aria-label="Field label" />
              <label class="secret-toggle" class:on={cf.secret} title="Mask and auto-clear when copied">
                <input type="checkbox" bind:checked={cf.secret} />
                <Icon name="lock" size={14} /> Secret
              </label>
              <button type="button" class="icon-btn" onclick={() => draft.custom.splice(i, 1)} aria-label="Remove field">
                <Icon name="trash" size={17} />
              </button>
            </div>
            <div class="group">
              <input
                class="input"
                class:mono={cf.secret}
                type={masked ? 'password' : 'text'}
                placeholder="Value"
                autocomplete="off"
                spellcheck="false"
                aria-label="{cf.label || 'Field'} value"
                bind:value={cf.value}
              />
              <div class="tools">
                {#if cf.secret}
                  <button type="button" class="icon-btn" onclick={() => (revealed[cf.id] = !revealed[cf.id])} aria-label="Toggle visibility">
                    <Icon name={masked ? 'eye' : 'eyeOff'} size={18} />
                  </button>
                {/if}
                <button type="button" class="icon-btn" onclick={() => pasteInto((t) => (cf.value = t))} title="Paste" aria-label="Paste value">
                  <Icon name="paste" size={18} />
                </button>
              </div>
            </div>
          </div>
        {/each}
        <div class="presets">
          <button type="button" class="chip add" onclick={() => addCustom()}><Icon name="plus" size={15} /> Add field</button>
          {#each PRESETS as [label, secret] (label)}
            <button type="button" class="chip" onclick={() => addCustom(label, secret)}>{label}</button>
          {/each}
        </div>
      </section>

      <div class="field">
        <label for="f-tags">Tags</label>
        <input id="f-tags" class="input" bind:value={tagText} placeholder="work, finance" />
      </div>

      <div class="field">
        <label for="f-notes">Notes</label>
        <textarea id="f-notes" class="input" rows="3" bind:value={draft.notes}></textarea>
      </div>
    </div>

    <footer class="sheet-foot">
      <button type="button" class="btn" onclick={() => dialog.close()}>Cancel</button>
      <button class="btn btn-primary" disabled={saving}>{isNew ? 'Add to vault' : 'Save changes'}</button>
    </footer>
  </form>
</dialog>

<style>
  .field {
    display: grid;
    gap: 0.35rem;
  }
  label,
  .section-label {
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .group {
    position: relative;
    display: flex;
    align-items: flex-start;
  }
  .group .input {
    padding-right: 7.5rem;
  }
  .tools {
    position: absolute;
    top: 2px;
    right: 2px;
    display: flex;
  }

  .custom {
    display: grid;
    gap: 0.5rem;
    padding: 0.6rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }
  .custom-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .label-input {
    flex: 1;
    min-width: 0;
    font-weight: 600;
  }
  .custom .group .input {
    padding-right: 5rem;
  }
  .secret-toggle {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    flex: none;
    min-height: 36px;
    padding: 0 0.7rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 0.75rem;
    cursor: pointer;
    user-select: none;
  }
  .secret-toggle.on {
    border-color: transparent;
    background: var(--grad);
    color: #fff;
  }
  .secret-toggle:focus-within {
    box-shadow: var(--ring);
  }
  .secret-toggle input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 34px;
    padding: 0 0.8rem;
    border: 1px dashed var(--border);
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 600;
  }
  .chip:hover {
    border-style: solid;
    color: var(--text);
  }
  .chip.add {
    border-style: solid;
    border-color: transparent;
    background: var(--grad-soft);
    color: var(--teal-300);
  }
</style>
