import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:phone` serves over HTTPS on the LAN (Web Crypto needs a secure context off localhost).
// BASE_PATH lets the app live in a sub-folder, e.g. GitHub Pages at /<repo>/.
export default defineConfig(({ mode }) => ({
  base: process.env.BASE_PATH || '/',
  plugins: [svelte(), mode === 'phone' && basicSsl()],
  build: { target: 'es2022' },
}));
