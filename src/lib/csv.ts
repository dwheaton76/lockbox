// Imports logins from the CSV exports of common browsers and password managers.
import { blankEntry } from './kinds';
import { hostOf, loginKey } from './merge';
import type { Entry, PasswordEntry } from './types';

/** RFC 4180 parser: quoted fields, escaped quotes, embedded commas/newlines, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (src[i + 1] === '"') field += src[++i];
      else quoted = false;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field || row.length) rows.push([...row, field]);
  return rows.filter((r) => r.some((f) => f.trim()));
}

// Header aliases in priority order. Covers Chrome/Edge, Firefox, Safari/iCloud,
// Bitwarden, 1Password, LastPass and KeePassXC exports.
const COLUMNS = {
  title: ['title', 'name'],
  url: ['url', 'login_uri', 'website', 'web site', 'uri'],
  username: ['username', 'login_username', 'user name', 'login', 'email'],
  password: ['password', 'login_password'],
  notes: ['notes', 'note', 'extra', 'comments'],
  totp: ['otpauth', 'login_totp', 'totp', 'otp'],
  tags: ['tags', 'folder', 'grouping', 'group'],
  favorite: ['favorite', 'fav'],
  type: ['type'],
} as const;

type Column = keyof typeof COLUMNS;

export interface CsvImportResult {
  entries: Entry[];
  /** Rows matching an existing login (or an earlier row) by site + username + password. */
  duplicates: number;
  /** Rows that aren't logins (e.g. Bitwarden notes/cards) or are empty. */
  skipped: number;
}

export function importCsv(text: string, existing: Entry[] = []): CsvImportResult {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error('The file is empty.');

  const names = header.map((h) => h.trim().toLowerCase());
  const index = {} as Record<Column, number>;
  for (const col of Object.keys(COLUMNS) as Column[]) {
    const alias = COLUMNS[col].find((a) => names.includes(a));
    index[col] = alias ? names.indexOf(alias) : -1;
  }
  if (index.password < 0) {
    throw new Error('No password column found. Export your passwords as CSV from your browser or password manager.');
  }

  const seen = new Set(existing.map(loginKey).filter(Boolean));
  const entries: Entry[] = [];
  let duplicates = 0;
  let skipped = 0;

  for (const row of rows) {
    // Passwords keep their exact value; everything else is trimmed.
    const raw = (col: Column) => (index[col] >= 0 ? (row[index[col]] ?? '') : '');
    const get = (col: Column) => raw(col).trim();

    const type = get('type').toLowerCase();
    if ((type && type !== 'login') || (!raw('password') && !get('username'))) {
      skipped++;
      continue;
    }

    const entry = blankEntry('password') as PasswordEntry;
    entry.url = get('url');
    entry.username = get('username');
    entry.password = raw('password');
    entry.title = get('title') || hostOf(entry.url) || entry.username || 'Imported login';
    entry.notes = get('notes');
    entry.tags = get('tags').split(',').map((t) => t.trim()).filter(Boolean);
    entry.favorite = ['1', 'true', 'yes'].includes(get('favorite').toLowerCase());
    const totp = get('totp');
    if (totp) entry.custom.push({ id: crypto.randomUUID(), label: 'TOTP secret', value: totp, secret: true });

    const key = loginKey(entry)!;
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    entries.push(entry);
  }

  return { entries, duplicates, skipped };
}
