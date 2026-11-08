import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // During local dev, the API runs under `wrangler dev` on port 8787.
    proxy: {
      '/api': { target: 'http://localhost:8787', ws: true },
    },
  },
  build: {
    outDir: 'dist',
  },
});
