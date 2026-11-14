export type EntryKind = 'password' | 'account' | 'passkey' | 'apikey';

/** User-defined extra field, available on every entry kind. */
export interface CustomField {
  id: string;
  label: string;
  value: string;
  secret: boolean;
}

interface BaseEntry {
  id: string;
  kind: EntryKind;
  title: string;
  notes: string;
  tags: string[];
  custom: CustomField[];
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PasswordEntry extends BaseEntry {
  kind: 'password';
  username: string;
  password: string;
  url: string;
  /** TOTP secret (base32 or otpauth:// URI). Absent on entries saved before 2FA support. */
  totp?: string;
}

export interface AccountEntry extends BaseEntry {
  kind: 'account';
  institution: string;
  accountHolder: string;
  email: string;
  phone: string;
  username: string;
  password: string;
  accountNumber: string;
  pin: string;
  url: string;
  securityQA: string;
  totp?: string;
}

export interface PasskeyEntry extends BaseEntry {
  kind: 'passkey';
  rpId: string;
  userName: string;
  credentialId: string;
  userHandle: string;
  publicKey: string;
  privateKey: string;
}

export interface ApiKeyEntry extends BaseEntry {
  kind: 'apikey';
  service: string;
  keyId: string;
  secret: string;
  expires: string;
}

export type Entry = PasswordEntry | AccountEntry | PasskeyEntry | ApiKeyEntry;

export interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  mono?: boolean;
  multiline?: boolean;
  type?: 'text' | 'url' | 'date' | 'email' | 'tel';
  generator?: 'password' | 'apikey';
}
