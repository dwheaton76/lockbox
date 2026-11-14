import { KINDS, getField } from './kinds';
import type { Entry } from './types';

/** Searchable text for an entry. Secret fields are deliberately excluded. */
function haystack(entry: Entry): string {
  const visible = KINDS[entry.kind].fields.filter((f) => !f.secret).map((f) => getField(entry, f.key));
  const custom = entry.custom.flatMap((f) => (f.secret ? [f.label] : [f.label, f.value]));
  return [entry.title, entry.notes, KINDS[entry.kind].label, ...entry.tags, ...visible, ...custom]
    .join(' ')
    .toLowerCase();
}

/** Every whitespace-separated term must appear somewhere; `#tag` matches tags exactly. */
export function matches(entry: Entry, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const text = haystack(entry);
  return terms.every((t) =>
    t.startsWith('#') && t.length > 1 ? entry.tags.some((tag) => tag.toLowerCase() === t.slice(1)) : text.includes(t),
  );
}

export function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort(
    (a, b) => Number(b.favorite) - Number(a.favorite) || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
  );
}
