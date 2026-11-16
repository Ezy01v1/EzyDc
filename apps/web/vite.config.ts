import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = process.env.VITE_DEV_API ?? 'http://127.0.0.1:3100';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // El frontend consume el código fuente TS de @ezydc/shared (tree-shaking real, sin build previo).
    alias: { '@ezydc/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) },
  },
  server: {
    port: 5300,
    strictPort: true,
    // Mismo origen en desarrollo: cookies SameSite=Lax sin CORS ni cookies de terceros.
    proxy: {
      '/api': { target: API },
      '/socket.io': { target: API, ws: true },
    },
  },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          data: ['@tanstack/react-query', 'zustand', 'socket.io-client'],
        },
      },
    },
  },
});
