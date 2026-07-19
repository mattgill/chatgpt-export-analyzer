import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

export default defineConfig({
  base: './',
  plugins: [react(), wasm(), topLevelAwait()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    clearMocks: true,
    exclude: ['tests/browser/**', '**/node_modules/**', '**/dist/**'],
  },
})
