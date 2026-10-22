// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const modules = ['identity', 'reference', 'catalog', 'units', 'inventory'];
const noParentImports = { group: ['../*'], message: "Use the '@/…' alias instead of '../' imports." };
const infraPackages = ['@prisma/*', '@aws-sdk/*', 'nodemailer', 'argon2', 'pg', 'handlebars', '**/generated/**'];

const layerPatterns = {
  // domain: pure TypeScript — no Nest runtime, no Prisma/AWS/SMTP, no outer layers.
  domain: [
    { group: ['@nestjs/*'], allowTypeImports: true, message: 'domain must not depend on Nest (type-only imports are allowed).' },
    { group: infraPackages, allowTypeImports: true, message: 'domain must not depend on infrastructure libraries.' },
    { group: ['**/application/**', '**/infrastructure/**', '**/presentation/**'], message: 'domain cannot import outer layers.' },
  ],
  // application: orchestrates ports; never touches Prisma/S3/SMTP or GraphQL.
  application: [
    { group: infraPackages, allowTypeImports: true, message: 'application talks to ports, not libraries.' },
    { group: ['@nestjs/graphql', '@nestjs/apollo'], message: 'application must not know about GraphQL.' },
    { group: ['**/infrastructure/**', '**/presentation/**'], message: 'application cannot import infrastructure/presentation.' },
  ],
  // presentation: GraphQL <-> commands/queries only.
  presentation: [
    { group: ['@prisma/*', '**/generated/**', '**/infrastructure/**'], message: 'resolvers use CommandBus/QueryBus only — no repositories or Prisma.' },
    { group: ['**/domain/ports/**'], allowTypeImports: true, message: 'resolvers must not use repository ports (type-only imports are fine).' },
  ],
  infrastructure: [],
};

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src/generated', 'prisma/migrations', 'scripts', '.venv', '.local-models'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node }, parserOptions: { ecmaVersion: 2023, sourceType: 'module' } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off', // allowed at raw-SQL / framework edges; keep an eye on it in reviews
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports', disallowTypeAnnotations: false }],
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-console': 'error',
      // always use the @/ alias instead of climbing folders
      'no-restricted-imports': ['error', { patterns: [{ group: ['../*'], message: "Use the '@/…' alias instead of '../' imports." }] }],
    },
  },
  // Decorator-based Nest classes legitimately need value imports for DI metadata.
  { files: ['src/**/*.ts'], rules: { '@typescript-eslint/consistent-type-imports': 'off' } },

  // ── Clean Architecture boundaries (generated per module + layer; later blocks replace earlier ones, so each block is complete) ──
  ...modules.flatMap((mod) =>
    Object.entries(layerPatterns).map(([layer, patterns]) => ({
      files: [`src/modules/${mod}/${layer}/**/*.ts`],
      rules: {
        'no-restricted-imports': ['error', { patterns: [
          noParentImports,
          ...patterns,
          // modules talk through the buses / public query classes, never through another module's internals
          { group: modules.filter((m) => m !== mod).flatMap((m) => [`@/modules/${m}/infrastructure/**`, `@/modules/${m}/domain/**`, `@/modules/${m}/presentation/**`]), message: "Don't reach into another module's internals; dispatch its query/command instead." },
        ] }],
      },
    })),
  ),

  { files: ['test/**/*.ts', 'prisma/seed/**/*.ts', '*.config.ts'], rules: { 'no-console': 'off', 'no-restricted-imports': 'off' } },
);
