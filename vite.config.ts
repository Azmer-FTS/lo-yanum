import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// PWA-ready structure: static manifest + icons live in /public.
// Service worker registration is deliberately deferred to Lot 1 (offline sync).
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@locales': path.resolve(__dirname, 'src/locales'),
    },
  },
  server: {
    // Honour PORT so a second dev server can be started alongside the first
    // (agent sessions, side-by-side theme comparison) without editing config.
    port: Number(process.env.PORT) || 5173,
    host: true,
  },
})
