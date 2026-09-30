import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const pkg = (name: string) =>
  fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url));

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
    // Adapter ada di paket workspace yang sudah dikompilasi jadi CJS, jadi
    // modulnya di luar graph transformasi Vitest dan `vi.mock` tidak
    // meng-intercept import di dalamnya. Di-inline agar bisa dipalsukan.
    server: {
      deps: {
        // Adapter diimpor dari source-nya, bukan dari dist CJS yang sudah
        // dikompilasi, supaya modulnya masuk graph transformasi Vitest dan
        // `vi.mock` (mis. untuk `mqtt`) benar-benar bisa meng-intercept.
        inline: [/@nexahome\/integration-(mqtt|tasmota)/],
      },
    },
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
  resolve: {
    alias: {
      '@nexahome/integration-mqtt': pkg('integration-mqtt'),
      '@nexahome/integration-tasmota': pkg('integration-tasmota'),
    },
  },
  plugins: [
    // SWC diperlukan agar decorator NestJS (+ emitDecoratorMetadata) bekerja.
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
