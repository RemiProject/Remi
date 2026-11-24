import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['test/integration/email-verification-code.spec.ts'], environment: 'node', hookTimeout: 120_000, testTimeout: 30_000 },
  esbuild: { target: 'es2023', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } },
});
