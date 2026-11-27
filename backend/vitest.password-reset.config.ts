import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['test/integration/password-reset-code.spec.ts'], environment: 'node', hookTimeout: 120_000, testTimeout: 30_000,
    // Load the compiled app with native Node, as production does. Transforming it would load a second graphql copy (ESM and CJS).
    server: { deps: { external: [/[\\/]backend[\\/]dist[\\/]/] } },
  },
  esbuild: { target: 'es2023', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } },
});
