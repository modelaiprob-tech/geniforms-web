import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  site: 'https://geniforms.es',
  vite: {
    server: {
      headers: {
        // Vite envía COOP: same-origin por defecto, lo que bloquea
        // el popup de Firebase Auth (impide window.closed polling).
        'Cross-Origin-Opener-Policy': 'unsafe-none',
        'Cross-Origin-Embedder-Policy': 'unsafe-none',
      },
    },
  },
});
