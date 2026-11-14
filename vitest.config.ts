import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // The svelte plugin compiles runes in *.svelte.ts modules (the vault store).
  plugins: [svelte()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000, // PBKDF2 at 600k iterations is deliberately slow
  },
});
