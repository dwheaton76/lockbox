// Google Drive storage for the encrypted vault file.
//
// Uses the OAuth 2.0 browser (token) flow directly rather than loading Google's sign-in
// script, so no third-party code runs on a page that holds decrypted secrets. The token is
// limited to the `drive.appdata` scope: a hidden per-app folder, with no access to your files.
import { randomBytes, toB64Url } from './crypto';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'lockbox-vault.json';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

// sessionStorage keys (shared with public/oauth-callback.js)
const TOKEN_KEY = 'lockbox.gdrive.token';
const STATE_KEY = 'lockbox.gdrive.state';
const REDIRECT_KEY = 'lockbox.gdrive.redirect';
const RESULT_KEY = 'lockbox.gdrive.result';
const CHANNEL = 'lockbox-oauth';

/** The stored token was rejected (expired or revoked); sign in again. */
export class AuthRequired extends Error {
  constructor() {
    super('Sign in to Google Drive to sync.');
  }
}

interface OAuthResult {
  state?: string;
  token?: string;
  expiresIn?: number;
  error?: string;
}

export const driveConfigured = () => Boolean(CLIENT_ID);

function saveToken(result: OAuthResult): string {
  if (result.error || !result.token) throw new Error(result.error === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google sign-in failed.');
  if (!result.state || result.state !== sessionStorage.getItem(STATE_KEY)) throw new Error('Google sign-in failed a security check. Try again.');
  sessionStorage.removeItem(STATE_KEY);
  const expiresAt = Date.now() + (result.expiresIn ?? 3600) * 1000;
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: result.token, expiresAt }));
  return result.token;
}

/** A still-valid access token, if we have one (including one returned by a redirect sign-in). */
export function storedToken(): string | null {
  const redirected = sessionStorage.getItem(RESULT_KEY);
  if (redirected) {
    sessionStorage.removeItem(RESULT_KEY);
    try {
      saveToken(JSON.parse(redirected));
    } catch {
      // fall through: treated as not signed in
    }
  }
  try {
    const { token, expiresAt } = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') ?? {};
    return token && expiresAt - 60_000 > Date.now() ? token : null;
  } catch {
    return null;
  }
}

export function forgetToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

/** Popups don't return to iOS home-screen apps, so those use a full-page redirect instead. */
function preferRedirect(): boolean {
  const standalone = matchMedia('(display-mode: standalone)').matches;
  return standalone && /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function redirectTo(url: string): Promise<never> {
  sessionStorage.setItem(REDIRECT_KEY, '1');
  location.assign(url);
  return new Promise(() => {}); // the page is navigating away
}

/**
 * Starts Google sign-in. Must be called directly from a click handler (no awaits before it),
 * or the browser will block the popup.
 */
export function signIn(): Promise<string> {
  if (!CLIENT_ID) return Promise.reject(new Error('Google Drive sync is not configured.'));
  const state = toB64Url(randomBytes(16));
  sessionStorage.setItem(STATE_KEY, state);
  const url =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: `${location.origin}${import.meta.env.BASE_URL}oauth-callback.html`,
      response_type: 'token',
      scope: SCOPE,
      state,
      include_granted_scopes: 'true',
    });

  if (preferRedirect()) return redirectTo(url);
  // A popup inherits a copy of this tab's sessionStorage; make sure it takes the popup path.
  sessionStorage.removeItem(REDIRECT_KEY);
  const popup = window.open(url, 'lockbox-google', 'popup,width=480,height=640');
  if (!popup) return redirectTo(url);

  return new Promise((resolve, reject) => {
    const channel = new BroadcastChannel(CHANNEL);
    // Google's pages isolate the popup, so `popup.closed` is unreliable: use a generous timeout.
    const timeout = setTimeout(() => finish(() => reject(new Error('Google sign-in timed out.'))), 5 * 60_000);
    const finish = (settle: () => void) => {
      clearTimeout(timeout);
      channel.close();
      settle();
    };
    channel.onmessage = (event: MessageEvent<OAuthResult>) => {
      finish(() => {
        try {
          resolve(saveToken(event.data));
        } catch (err) {
          reject(err);
        }
      });
    };
  });
}

export function revokeToken(token: string) {
  fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
}

async function api(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  if (res.status === 401) {
    forgetToken();
    throw new AuthRequired();
  }
  if (!res.ok) throw new Error(`Google Drive error (${res.status}).`);
  return res;
}

export interface RemoteFile {
  id: string;
  text: string;
}

export async function readVaultFile(token: string): Promise<RemoteFile | null> {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const list = await (await api(token, `${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id)`)).json();
  const id: string | undefined = list.files?.[0]?.id;
  if (!id) return null;
  return { id, text: await (await api(token, `${DRIVE}/files/${id}?alt=media`)).text() };
}

export async function writeVaultFile(token: string, id: string | null, text: string): Promise<void> {
  if (id) {
    await api(token, `${UPLOAD}/files/${id}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: text,
    });
    return;
  }
  const boundary = `lockbox-${toB64Url(randomBytes(12))}`;
  const metadata = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
  await api(token, `${UPLOAD}/files?uploadType=multipart`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}
