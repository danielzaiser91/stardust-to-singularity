import { defineConfig } from 'vitest/config';
import pkg from './package.json';

// Build-Version: CI setzt BUILD_VERSION auf den Commit-SHA → jeder Deploy ist eine
// neue Version (Update-Banner). Muss exakt zu dist/version.json passen (Workflow).
const sha = (process.env.BUILD_VERSION ?? 'dev').slice(0, 8);

// DEPLOY_BASE erlaubt Builds für andere Plattformen (Netlify/itch.io → './', siehe todo.md)
export default defineConfig({
  base: process.env.DEPLOY_BASE ?? '/stardust-to-singularity/',
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version}+${sha}`),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000
  }
});
