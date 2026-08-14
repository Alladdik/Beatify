import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: true, // Listen on all network interfaces (0.0.0.0) for local Wi-Fi access on iPhone
    port: 5174,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
