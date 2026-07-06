import { defineConfig } from 'vitest/config';
import pkg from './package.json';

// Build-Version = package.json-Version (normal hochgezählt, z. B. 0.1.0 → 0.1.1 bei jedem
// Release-würdigen Push). Muss exakt zu dist/version.json passen (Workflow) — das Update-Banner
// vergleicht beide als String, ein vergessener Versions-Bump lässt es Updates NICHT erkennen.
export default defineConfig({
  base: process.env.DEPLOY_BASE ?? '/stardust-to-singularity/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
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
