import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // relative asset paths: works on GitHub Pages subpaths, Netlify, any static host
  base: './',
  server: { port: 5173 },
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 2000 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
