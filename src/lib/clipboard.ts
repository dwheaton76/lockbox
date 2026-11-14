import { toast } from './toast.svelte';

export const CLIPBOARD_CLEAR_MS = 30_000;

let clearTimer: ReturnType<typeof setTimeout> | undefined;
let pending: { text: string; due: number } | null = null;

async function clearIfDue() {
  if (!pending || Date.now() < pending.due) return;
  const { text } = pending;
  pending = null;
  try {
    // Only clear if the user hasn't copied something else since.
    if ((await navigator.clipboard.readText()) !== text) return;
  } catch {
    // readText can be denied; fall through and clear anyway.
  }
  await navigator.clipboard.writeText('').catch(() => {});
}

// Phones suspend timers while the app is in the background, and the clipboard can only be
// written while the page is focused, so catch up on any overdue clear when we come back.
if (typeof window !== 'undefined') {
  window.addEventListener('focus', clearIfDue);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && clearIfDue());
}

/** Copies text; secrets are wiped from the clipboard after a delay if still present. */
export async function copy(text: string, { secret = false, label = 'Copied' } = {}) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    toast.show('Clipboard unavailable');
    return;
  }
  if (!secret) return toast.show(label);

  toast.show(`${label} · clears in ${CLIPBOARD_CLEAR_MS / 1000}s`);
  pending = { text, due: Date.now() + CLIPBOARD_CLEAR_MS };
  clearTimeout(clearTimer);
  clearTimer = setTimeout(clearIfDue, CLIPBOARD_CLEAR_MS);
}

export async function paste(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    toast.show('Clipboard access denied — use Ctrl/⌘+V');
    return null;
  }
}
