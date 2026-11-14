/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google OAuth client ID for Drive sync (set in .env.local). Sync is hidden when unset. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
