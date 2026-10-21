import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['test/unit/**/*.spec.ts', 'src/**/*.spec.ts'], environment: 'node' },
  esbuild: { target: 'es2023', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } },
});
