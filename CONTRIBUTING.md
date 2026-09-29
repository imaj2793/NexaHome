# Kontribusi ke NexaHome

Terima kasih sudah tertarik dengan NexaHome! Proyek ini open-source
(MIT) dan kontribusi dalam bentuk apa pun sangat diterima — bug report, dokumentasi,
translasi, atau fitur.

Dokumen ini menjelaskan cara/setup agar kontribusi Anda mudah direview.
Detail teknis lengkap ada di [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

---

## 1. Sebelum mulai

- **Cari dulu issue yang sudah ada** — mungkin permintaan Anda sudah pernah
  dibahas. Untuk fitur besar, buka issue dulu untuk didiskusikan sebelum
  menulis kode.
- **Pisahkan perubahan** — satu PR sebaiknya satu tujuan. Refactor dicampur
  dengan fitur baru membuat review jauh lebih berat.
- **Ruang lingkup** — jangan mencampur perubahan yang tidak terkait di PR yang sama.

---

## 2. Setup lingkungan

Prasyarat: Node.js 20+, pnpm 12, PostgreSQL 16+, Git. Docker bersifat opsional
(tapi berguna untuk menjalankan seluruh stack).

```bash
git clone https://github.com/imaj2793/NexaHome.git
cd NexaHome
pnpm install
cp .env.example apps/api/.env
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Jangan pernah commit file `.env` — sudah tercakup `.gitignore`.

---

## 3. Struktur monorepo

```text
apps/api          NestJS API (Prisma, WebSocket, Nexa AI)
apps/web          Dashboard Next.js
packages/ai       Chat provider (mock/deepseek/openai)
packages/types    Shared TypeScript types
packages/device-core     Routing perintah ke adapter integrasi
packages/integration-mqtt / -tasmota   Adapter perangkat
integrations/wiz  Adapter WiZ (UDP)
```

Aturan praktis:

- Tipe bersama → `packages/types` (jangan duplikasi definisi).
- Logika integrasi → package masing-masing, bukan di dalam controller.
- `apps/*` hanya berisi HTTP/WebSocket + orkestrasi.

---

## 4. Gaya kode

- TypeScript strict, tanpa `any` (ESLint melarangnya).
- Fungsi kecil dan fokus; nama mengikuti pola yang sudah ada di berkas terdekat.
- Komentar menjelaskan **kenapa**, bukan apa — kode menjelaskan apa.
- Copy-paste blok besar lebih baik diekstrak menjadi helper.

---

## 5. Konvensi commit

Format [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <deskripsi singkat>

type: feat | fix | docs | refactor | test | ci | build | chore | perf | revert
scope: nama area, mis. api, web, mqtt, auth, docker
```

Contoh:

```text
feat(web): add energy chart for last 30 days
fix(mqtt): handle broker reconnect without duplicate subscriptions
docs: clarify BLE manual pairing steps
```

---

## 6. Verifikasi sebelum push

```bash
pnpm lint        # ESLint 9
pnpm typecheck   # tsc --noEmit per workspace
pnpm test        # Vitest: API + web
pnpm build       # production build
```

CI menjalankan keempat perintah yang sama, plus `pnpm audit --prod` dan build
image Docker. Menjaga semuanya hijau di lokal membuat umpan balik jauh lebih cepat.

Jika mengubah integrasi perangkat, tambahkan test untuknya. Perubahan yang
menyentuh perilaku perangkat **wajib** punya test.

---

## 7. Pull request

1. Buat branch bernama deskriptif: `feat/mqtt-reconnect`, `fix/scene-brightness`.
2. Kommit kecil dan fokus, ditulis dalam bahasa yang jelas.
3. Pastikan semua pemeriksaan di atas lulus.
4. Isi deskripsi PR: **apa** yang berubah, **mengapa**, dan **bagaimana** diuji.
5. Tautkan issue terkait (mis. `Closes #42`).

CI harus hijau sebelum di-merge. Maintainer mungkin meminta penyesuaian —
itu bagian normal dari kontribusi open-source.

---

## 8. Documentation

- Perubahan fitur → perbarui `README.md` dan `docs/DEPLOYMENT.md` bila ada
  environment variable atau langkah deployment baru.
- Perubahan API → perbarui `docs/API.md`.
- Perubahan besar atau perlu rilis → tambahkan entri di `CHANGELOG.md`
  pada bagian `[Unreleased]`.

---

## 9. Code of conduct

Dengan berkontribusi, Anda menyetujui [Code of Conduct](CODE_OF_CONDUCT.md).
