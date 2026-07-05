import { defineConfig } from 'vitest/config';

// DEPLOY_BASE erlaubt Builds für andere Plattformen (Netlify/itch.io → './', siehe todo.md)
export default defineConfig({
  base: process.env.DEPLOY_BASE ?? '/stardust-to-singularity/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000
  }
});
