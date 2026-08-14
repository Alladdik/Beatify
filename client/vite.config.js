import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_TARGET=electron  → base './'  outDir 'dist'        (file:// protocol)
// VITE_TARGET=web       → base '/'   outDir 'dist-web'    (HTTP server)
// default (npm run dev) → base '/'   dev server on :5173
const target = process.env.VITE_TARGET ?? 'web';
const isElectron = target === 'electron';

export default defineConfig({
  plugins: [react()],
  base: isElectron ? './' : '/',
  server: {
    port: 5173,
    host: true,   // accessible from phone on LAN
  },
  build: {
    outDir:    isElectron ? 'dist' : 'dist-web',
    assetsDir: 'assets',
  },
});
