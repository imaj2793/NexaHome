// Menyalin Prisma Client hasil `prisma generate` keluar dari (atau ke dalam)
// virtual store pnpm.
//
// Kenapa perlu: `prisma generate` menulis ke
//   node_modules/.pnpm/@prisma+client@<versi>_<peer>/node_modules/.prisma
// dan @prisma/client mencarinya dengan menelusuri `node_modules` ke atas dari
// direktorinya sendiri. Image runtime memakai `pnpm install --prod`, jadi paket
// @prisma/client terpasang tetapi isinya belum ter-generate, dan CLI `prisma`
// (devDependency) tidak ikut ada. Karena itu client-nya disalin lewat dua
// langkah ini agar tidak perlu `prisma generate` di image runtime.
//
// Pemakaian (dijalankan sebagai root di dalam image):
//   node prisma-client.mjs export  <projectDir> <destDir>
//   node prisma-client.mjs install <srcDir>  <projectDir>
//
// Lokasi virtual store ikut berubah bila versi/peer dependency berubah, jadi
// path-nya diselesaikan saat build — bukan ditulis manual di Dockerfile.

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const [command, first, second] = process.argv.slice(2);

if (!command || !first || !second) {
  console.error(
    'Pakai: prisma-client.mjs export <projectDir> <destDir>\n' +
      '      prisma-client.mjs install <srcDir> <projectDir>',
  );
  process.exit(1);
}

/** Direktori `node_modules` virtual store yang dipakai @prisma/client. */
function virtualStoreDir(projectDir) {
  const require = createRequire(join(resolve(projectDir), 'noop.js'));
  const manifest = require.resolve('@prisma/client/package.json');
  // <store>/@prisma/client/package.json → naik 3 level sampai <store>
  return dirname(dirname(dirname(manifest)));
}

if (command === 'export') {
  const dest = resolve(second);
  const src = join(virtualStoreDir(first), '.prisma');
  if (!existsSync(src)) {
    throw new Error(
      `Prisma Client belum ter-generate di ${src}. Jalankan \`pnpm db:generate\` lebih dulu.`,
    );
  }
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log(`Prisma Client disalin: ${src} -> ${dest}`);
} else if (command === 'install') {
  const src = resolve(first);
  if (!existsSync(src)) {
    throw new Error(`Sumber Prisma Client tidak ditemukan: ${src}`);
  }
  const dest = join(virtualStoreDir(second), '.prisma');
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
  rmSync(src, { recursive: true, force: true });
  console.log(`Prisma Client dipasang: ${src} -> ${dest}`);
} else {
  console.error(`Perintah tidak dikenal: ${command}`);
  process.exit(1);
}
