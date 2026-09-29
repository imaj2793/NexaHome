// Konfigurasi ESLint flat (ESLint 9) untuk seluruh workspace.
//
// Fokus: menangkap kesalahan nyata (variabel tak terdefinisi, promise tanpa
// await, import mati) tanpa memaksa format — format diserahkan ke tooling
// terpisah. Jalankan dengan `pnpm lint`.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/src/generated/**',
      // next-env.d.ts dibuat otomatis oleh Next.js.
      'apps/web/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // API + packages + integrations berjalan di Node.
    files: ['apps/api/**/*.ts', 'packages/**/*.ts', 'integrations/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // NestJS memakai DI lewat dekorator + Metadata; pola service
      // memang lazim tanpa typing eksplisit di semua tempat.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Web berjalan di browser.
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Konfigurasi & perkakas: boleh memakai Node API, tetapi diecualikan dari
    // aturan ketat typescript karena sering tanpa types.
    files: [
      '**/*.config.{js,mjs,ts}',
      '**/vitest.config.mts',
      'docker/**/*.mjs',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Test: deskripsi panjang & assertion helper boleh dipakai.
    files: ['**/*.spec.ts', '**/*.spec.tsx', '**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
);
