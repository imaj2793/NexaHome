import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: [
      'src/**/*.spec.ts',
      'test/**/*.spec.ts',
      'test/**/*.e2e-spec.ts',
    ],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.module.ts',
        'src/**/*.dto.ts',
        'src/main.ts',
      ],
    },
  },
  plugins: [
    // SWC diperlukan agar decorator NestJS (+ emitDecoratorMetadata) bekerja.
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
