import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // relative asset URLs — one build works at the origin root and under
  // path-prefixed proxies (Home Assistant ingress); see src/base.js
  base: '',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true, // also lets testing-library auto-cleanup between tests
    setupFiles: './src/test/setup.js',
    restoreMocks: true,
    unstubGlobals: true,
  },
  server: {
    port: 3500,
    // dev talks to the dockerized api + reverb on their published ports
    proxy: {
      '/api': 'http://localhost:3501',
      '/app': { target: 'http://localhost:3502', ws: true },
      '/mcp': 'http://localhost:3501',
    },
  },
})
