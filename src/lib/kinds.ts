// Schema for each entry kind. Cards, the editor and search are all driven from this table,
// so adding a new kind (e.g. SSH keys, secure notes) is mostly a matter of adding a row here.
import type { IconName } from './icons';
import type { CustomField, Entry, EntryKind, FieldDef } from './types';

interface KindDef {
  label: string;
  plural: string;
  icon: IconName;
  /** Field copied by the quick-copy button on the card. */
  primary: string;
  /** Fields joined to form the card subtitle. */
  subtitle: string[];
  fields: FieldDef[];
}

export const KINDS: Record<EntryKind, KindDef> = {
  password: {
    label: 'Password',
    plural: 'Passwords',
    icon: 'key',
    primary: 'password',
    subtitle: ['username', 'url'],
    fields: [
      { key: 'username', label: 'Username', placeholder: 'you@example.com' },
      { key: 'password', label: 'Password', secret: true, mono: true, generator: 'password' },
      { key: 'url', label: 'Website', type: 'url', placeholder: 'https://example.com' },
    ],
  },
  account: {
    label: 'Account',
    plural: 'Accounts',
    icon: 'user',
    primary: 'password',
    subtitle: ['institution', 'username'],
    fields: [
      { key: 'institution', label: 'Institution / provider', placeholder: 'Bank, utility, insurer…' },
      { key: 'accountHolder', label: 'Account holder' },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com' },
      { key: 'phone', label: 'Phone', type: 'tel' },
      { key: 'username', label: 'Username' },
      { key: 'password', label: 'Password', secret: true, mono: true, generator: 'password' },
      { key: 'accountNumber', label: 'Account number', secret: true, mono: true },
      { key: 'pin', label: 'PIN', secret: true, mono: true },
      { key: 'url', label: 'Website', type: 'url', placeholder: 'https://example.com' },
      { key: 'securityQA', label: 'Security questions & answers', secret: true, multiline: true },
    ],
  },
  passkey: {
    label: 'Passkey',
    plural: 'Passkeys',
    icon: 'fingerprint',
    primary: 'privateKey',
    subtitle: ['userName', 'rpId'],
    fields: [
      { key: 'rpId', label: 'Relying party', placeholder: 'example.com' },
      { key: 'userName', label: 'User name' },
      { key: 'credentialId', label: 'Credential ID', mono: true },
      { key: 'userHandle', label: 'User handle', mono: true },
      { key: 'publicKey', label: 'Public key (SPKI, base64)', mono: true, multiline: true },
      { key: 'privateKey', label: 'Private key (PKCS#8, base64)', mono: true, multiline: true, secret: true },
    ],
  },
  apikey: {
    label: 'API key',
    plural: 'API keys',
    icon: 'code',
    primary: 'secret',
    subtitle: ['service', 'keyId'],
    fields: [
      { key: 'service', label: 'Service', placeholder: 'Stripe, OpenAI, AWS…' },
      { key: 'keyId', label: 'Key ID / client ID', mono: true },
      { key: 'secret', label: 'Secret', secret: true, mono: true, generator: 'apikey' },
      { key: 'expires', label: 'Expires', type: 'date' },
    ],
  },
};

export const KIND_LIST = Object.keys(KINDS) as EntryKind[];

export function getField(entry: Entry, key: string): string {
  return String((entry as unknown as Record<string, unknown>)[key] ?? '');
}

export function setField(entry: Entry, key: string, value: string): void {
  (entry as unknown as Record<string, unknown>)[key] = value;
}

export function subtitleOf(entry: Entry): string {
  return KINDS[entry.kind].subtitle.map((k) => getField(entry, k)).filter(Boolean).join(' · ');
}

export function blankCustomField(label = '', secret = false): CustomField {
  return { id: crypto.randomUUID(), label, value: '', secret };
}

export function blankEntry(kind: EntryKind): Entry {
  const base = {
    id: crypto.randomUUID(),
    kind,
    title: '',
    notes: '',
    tags: [] as string[],
    custom: [] as CustomField[],
    favorite: false,
    createdAt: 0,
    updatedAt: 0,
  };
  return Object.assign(base, Object.fromEntries(KINDS[kind].fields.map((f) => [f.key, '']))) as unknown as Entry;
}
