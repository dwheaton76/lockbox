# Lockbox

An encrypted, offline-first vault for **passwords, passkeys and API keys**. It's an installable PWA that works on mobile and desktop.

Built with Svelte 5 (runes) + Vite + TypeScript. There are zero runtime dependencies, and the app is about 36 KB of gzipped JS.

## Quick start

```bash
npm install
npm run dev       # http://localhost:5173
npm run check     # type-check
npm test          # unit tests (Vitest)
npm run build     # production build -> dist/
npm run preview   # serve the build (service worker enabled)
```

> Web Crypto and the Clipboard API need a **secure context** (HTTPS or `localhost`).

## Using it on a phone

**Quick test over Wi-Fi.** Run `npm run dev:phone` and open the `Network: https://…` URL on your phone. The phone must be on the same Wi-Fi.
- The certificate is self-signed, so accept the browser warning.
- Windows may ask you to allow Node through the firewall. Allow it for private networks.
- This is for testing only. The vault lives on the phone, and offline/install support won't work with a self-signed cert.

**Daily use.** The app is published with **GitHub Pages** at **https://dwheaton76.github.io/lockbox/**. Every push to `main` runs `.github/workflows/deploy.yml`, which type-checks, runs the tests, builds and publishes.
- The workflow builds with `BASE_PATH=/<repo>/`, so the app works in a sub-folder.
- The Google client ID comes from the repository variable `VITE_GOOGLE_CLIENT_ID` (Settings → Secrets and variables → Actions → Variables).
- For Drive sync, the Google OAuth client also needs the origin `https://dwheaton76.github.io` and the redirect URI `https://dwheaton76.github.io/lockbox/oauth-callback.html`.

Any other static HTTPS host works too; build with `npm run build` and upload `dist/`. Open the site on your phone, then install it:
- iPhone (Safari): Share → **Add to Home Screen**
- Android (Chrome): ⋮ → **Install app**

The installed app works offline.

To keep your phone and computer in step, turn on **Google Drive sync** (below). Without sync, each device has its own separate vault. You can still copy a vault across with Settings → Export backup / Import.

## Google Drive sync

Each sync downloads the encrypted vault file from Google Drive, merges it with this device's vault, and uploads the result.
- The file lives in Drive's hidden **app-data folder**. Lockbox can't see your other Drive files, and the file doesn't appear in your Drive.
- Google only ever stores ciphertext.
- Sync runs on unlock and a couple of seconds after each change. You can also tap the cloud icon in the header.
- **Merging.** The newest edit of an item wins. Deletions leave a marker (a "tombstone"), so a deleted item isn't brought back by a device that still has it.
- **Never overwrites what it can't read.** If the Drive copy uses a different master password, Lockbox asks for that password once and switches this device to it. Synced devices then share one master password. A password change on one device reaches the others the same way.
- No Google script is loaded. Sign-in is a plain OAuth 2.0 token flow, so no third-party code runs on a page holding decrypted secrets. On iPhone home-screen apps, or when popups are blocked, sign-in uses a full-page redirect. After the redirect, unlock again and sync continues.
- Google access tokens last about an hour. When one expires, the cloud icon turns amber; tap it to sign in again (usually a single click).

### One-time setup: create a Google OAuth client ID (free, ~5 minutes)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project, e.g. "Lockbox".
2. **APIs & Services → Library**: search for **Google Drive API** and click **Enable**.
3. **OAuth consent screen** (also labelled "Google Auth Platform"):
   - Choose **External** and fill in the app name and your email.
   - Under **Data access / Scopes**, add `https://www.googleapis.com/auth/drive.appdata`.
   - Under **Audience / Test users**, add your own Google account. Leaving the app in *Testing* mode is fine for personal use.
4. **Credentials → Create credentials → OAuth client ID**, application type **Web application**:
   - **Authorized JavaScript origins:** `http://localhost:5173`, `http://localhost:4173` and your deployed site, e.g. `https://lockbox.example.pages.dev`.
   - **Authorized redirect URIs:** the same origins followed by `/oauth-callback.html`, e.g. `http://localhost:5173/oauth-callback.html`.
5. Copy the client ID. Create `.env.local` in the project root (it's git-ignored) containing:
   ```
   VITE_GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
   ```
6. Restart `npm run dev`, or rebuild before deploying. Then go to Settings → **Connect Google Drive**.

> Google only accepts `localhost` or a real domain as an origin, so sign-in won't work on the `npm run dev:phone` LAN address (`https://192.168.x.x`). On your phone, use the deployed site.

## Features

- **Master-password vault.** PBKDF2-SHA256 (600k iterations) derives an AES-256-GCM key. The whole entry list is encrypted as one blob in IndexedDB, so titles, usernames and URLs are encrypted too.
- **Four entry types**, all driven by the schema in `src/lib/kinds.ts`:
  - Passwords: username, password, URL
  - Accounts: institution, account holder, email, phone, username, password, account number, PIN, website, security Q&A
  - Passkeys: RP ID, user, credential ID, user handle, ES256 public/private key
  - API keys: service, key ID, secret, expiry
- **Custom fields** on any entry, each with a label, a value and a "secret" toggle. Presets cover common account details (member ID, routing number, recovery codes, security answer).
- **Generators:**
  - Passwords use unbiased rejection sampling, character-class toggles, a look-alike filter and an entropy meter.
  - API keys are prefixed base62 strings.
  - Passkey generation creates a P-256 key pair.
- **Search.** Instant, multi-term search across non-secret fields; `#tag` filters by tag. Type filter tabs. `Ctrl/⌘+K` or `/` focuses the search box.
- **Copy & paste.**
  - Every field has a one-tap copy button, and cards have a quick-copy button for the main secret.
  - Copied secrets are cleared from the clipboard after 30s.
  - Every editor field has a paste button.
- **Import** from CSV exports: Chrome/Edge, Firefox, Safari/iCloud, Bitwarden, 1Password, LastPass and KeePassXC. Logins already in the vault (same site + username + password) are skipped. TOTP secrets are kept as a secret custom field.
- **Google Drive sync** of the encrypted vault (see above).
- **Encrypted backup** export/import. A backup opens with the master password in use when it was exported. Importing merges by id, so nothing is duplicated and newer edits win.
- **Change master password.** The vault is re-encrypted with a fresh salt. The vault and its key settings are written in a single IndexedDB transaction, so an interrupted change can't lock you out.
- **Auto-lock** after 5 minutes of inactivity, or 60 seconds after the app goes to the background. The background check uses elapsed time, so it still works when a phone suspends timers. An overdue clipboard clear also runs when the app comes back.
- **Mobile-first UI.** Bottom-sheet dialogs, safe-area insets, 44px touch targets, light and dark themes, purple/teal gradient design.

## Layout

```
src/
  lib/
    crypto.ts          PBKDF2 / AES-GCM seal & open, base64 helpers
    db.ts              ~30-line IndexedDB key/value wrapper
    vault.svelte.ts    reactive vault store (create/unlock/lock/save/import/export/change password)
    kinds.ts           entry-kind schema (fields, icons, subtitles)
    csv.ts             CSV parser + importers for common password managers
    backup.ts          encrypted vault file format (backups and the Drive copy)
    merge.ts           merge-by-id, duplicate-login detection
    sync.ts            vault data shape, tombstones, two-way sync merge
    gdrive.ts          Google OAuth (popup/redirect) + Drive appDataFolder read/write
    drive-sync.svelte.ts  sync status, sign-in and retry orchestration
    generator.ts       password / API key / passkey generators
    search.ts          query matching & sorting
    clipboard.ts       copy with auto-clear, paste
    *.test.ts          Vitest unit tests (vault tests use fake-indexeddb)
  components/          Unlock, VaultView, EntryCard, EntryEditor, Generator, Settings,
                       DriveSyncPanel, SyncButton, Icon, Toast
public/                manifest, icon, service worker, OAuth callback page
```

## Known limitations / next steps

- **Passkeys.** A web page can't register as the OS passkey provider. Stored passkeys are kept safely and can be exported, but using them to sign in needs a native shell (an Android Credential Manager provider, or an iOS AuthenticationServices extension). Wrapping this app with **Capacitor** is the natural path.
- **Sync conflicts are resolved per item, newest edit wins.** If two devices edit the *same* item before syncing, the older edit is lost. Drive writes aren't conditional either, so two devices syncing in the same second could drop one side's change until it syncs again. That's rare for one person.
- Tombstones are kept forever. They're tiny (id + timestamp), but could be pruned after a few months.
- **No fingerprint / Face ID unlock or 2FA codes yet.**
- Consider **Argon2id** (via WASM) instead of PBKDF2 for stronger master-password hardening.
- There's no "forgot master password" reset. By design, a vault can't be recovered without its password.
