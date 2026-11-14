import { describe, expect, it } from 'vitest';
import { importCsv, parseCsv } from './csv';
import type { PasswordEntry } from './types';

const logins = (text: string, existing: PasswordEntry[] = []) => {
  const result = importCsv(text, existing);
  return { ...result, entries: result.entries as PasswordEntry[] };
};

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, embedded commas and newlines', () => {
    expect(parseCsv('a,"b,c","say ""hi""","multi\nline"\n')).toEqual([['a', 'b,c', 'say "hi"', 'multi\nline']]);
  });

  it('handles CRLF, a BOM, blank lines and a missing trailing newline', () => {
    expect(parseCsv('﻿h1,h2\r\n\r\nv1,v2')).toEqual([
      ['h1', 'h2'],
      ['v1', 'v2'],
    ]);
  });

  it('keeps empty fields', () => {
    expect(parseCsv('a,,c\n')).toEqual([['a', '', 'c']]);
  });
});

describe('importCsv', () => {
  it('reads Chrome / Edge exports', () => {
    const { entries } = logins(
      'name,url,username,password,note\nGitHub,https://github.com/login,dev,s3cret, my note \n',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'password',
      title: 'GitHub',
      url: 'https://github.com/login',
      username: 'dev',
      password: 's3cret',
      notes: 'my note',
    });
  });

  it('reads Firefox exports and derives a title from the URL', () => {
    const { entries } = logins(
      'url,username,password,httpRealm,formActionOrigin,guid\nhttps://www.example.com,me,pw,,,{abc}\n',
    );
    expect(entries[0].title).toBe('example.com');
  });

  it('reads Bitwarden exports, skipping non-login rows', () => {
    const csv = [
      'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp',
      'Work,1,login,Jira,,,0,https://jira.example.com,alice,pw1,JBSWY3DPEHPK3PXP',
      ',,note,Wifi code,the code is 1234,,0,,,,',
    ].join('\n');
    const { entries, skipped } = logins(csv);
    expect(skipped).toBe(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ title: 'Jira', username: 'alice', password: 'pw1', favorite: true, tags: ['Work'] });
    expect(entries[0].totp).toBe('JBSWY3DPEHPK3PXP');
    expect(entries[0].custom).toEqual([]);
  });

  it('reads Safari / iCloud exports', () => {
    const { entries } = logins('Title,URL,Username,Password,Notes,OTPAuth\nBank,https://bank.com,me,pw,,\n');
    expect(entries[0]).toMatchObject({ title: 'Bank', url: 'https://bank.com', username: 'me' });
  });

  it('preserves leading/trailing spaces in passwords', () => {
    const { entries } = logins('name,url,username,password\nX,x.com,u," pw "\n');
    expect(entries[0].password).toBe(' pw ');
  });

  it('skips logins already in the vault and duplicates within the file', () => {
    const existing = logins('name,url,username,password\nGH,https://github.com,dev,pw\n').entries;
    const csv = [
      'name,url,username,password',
      'GitHub,https://www.github.com/login,DEV,pw', // same site + user + password as existing
      'GitHub,https://github.com,dev,new-pw', // password changed: imported
      'GitHub,https://github.com,dev,new-pw', // repeated row
    ].join('\n');
    const { entries, duplicates } = logins(csv, existing);
    expect(entries).toHaveLength(1);
    expect(entries[0].password).toBe('new-pw');
    expect(duplicates).toBe(2);
  });

  it('rejects files without a password column', () => {
    expect(() => importCsv('name,email\nBob,bob@example.com\n')).toThrow(/password column/);
    expect(() => importCsv('')).toThrow(/empty/);
  });
});
