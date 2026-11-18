import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // build:local serves it under /for-fun/ecg/ (see ../.htaccess); dev and a normal build use /
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  server: { port: 5200, strictPort: true },
});
