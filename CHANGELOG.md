# Changelog

Semua perubahan penting pada NexaHome dicatat di file ini.

Format berdasarkan [Keep a Changelog](https://keepachangelog.com/id/1.1.0/),
dan proyek ini mengikuti [Semantic Versioning](https://semver.org/lang/id/).

Commit mengikuti [Conventional Commits](https://www.conventionalcommits.org/id/v1.0.0/):

```
<type>(<scope>): <deskripsi>
# type: feat | fix | docs | refactor | test | ci | build | chore | perf
```

## [Unreleased]

### Fixed

- **Scan tidak lagi memalsukan perangkat.** Adapter MQTT dan Tasmota dalam mode
  `mock` kini mengembalikan array kosong. Sebelumnya scan menampilkan
  "WiZ Bulb Ruang Tamu", "Tasmota Relay", dan sensor fiktif yang tidak ada di
  jaringan mana pun. Mode `mock` berarti "tidak ada koneksi", bukan simulator.
- **AI tidak lagi memakai ID perangkat hardcode.** `MockAIProvider` mengembalikan
  `device_living_light`/`device_bedroom_light` yang tidak ada di database, sehingga
  setiap perintah ke perangkat gagal dengan "Perangkat tidak ditemukan".
  Sekarang `NexaService` mengirim katalog perangkat milik user ke provider
  (`AIProvider.chat({ devices })`), dan provider AI OpenAI-compatible
  menyisipkannya ke system prompt agar model memakai `device_id` yang benar.
- **Perintah tidak terkirim berulang.** Mock provider mengulang tool call yang
  sama pada setiap iterasi loop, sehingga satu perintah "nyalakan lampu" dikirim
  ke broker 4 kali. Sekarang provider berhenti dan menjawab final begitu hasil
  tool masuk.
- **Kegagalan tool Nexa dapat didiagnosis.** Error dari tool dicatat di log
  (`NexaToolsService`) dan alasan sebenarnya ditampilkan ke user, bukan pesan
  generik "Maaf, perintah belum selesai diproses."

### Removed

- **Integrasi WiZ dihapus** (`@nexahome/integration-wiz`, enum `IntegrationType.WIZ`).
  Protokol UDP port 38899 hanya berfungsi bila API berjalan langsung di jaringan
  lokal: dari dalam container, broadcast keluar tetapi balasan unicast dari lampu
  tidak sampai (NAT), sehingga scan selalu kosong dan tidak bisa diverifikasi
  dengan perangkat nyata. Menghapus integrasi ini lebih jujur daripada
  menampilkan data simulasi. Migrasi `20260929210000_remove_wiz_integration`
  membersihkan integrasi, perangkat, scene/automation action terkait, dan nilai
  enum (PostgreSQL tidak mendukung `DROP VALUE`, jadi tipe dibuat ulang).
- **Data perangkat dummy dari seed.** `pnpm db:seed` kini hanya membuat akun
  owner, home, 3 ruangan, dan integrasi MQTT/Tasmota. Data demo dipindahkan ke
  `pnpm db:seed:demo` (opsional) dan diberi label "(Demo)".


### Added

- **Auth**: refresh token dengan rotasi + deteksi reuse, endpoint `POST /api/auth/refresh`
  dan `POST /api/auth/logout`, rate limiting pada endpoint auth.
- **Test suite**: Vitest untuk API (18 file / 354 test) dan web (3 file / 79 test),
  task Turbo `test` serta `test:cov`, script root `pnpm test`.
- **Linting**: ESLint 9 flat config untuk seluruh workspace (`pnpm lint`, `pnpm lint:fix`).
- **Docker**: `apps/api/Dockerfile` (target `migrate` & `runner`, user non-root) dan
  `apps/web/Dockerfile` (Next.js standalone), plus `.dockerignore`.
- **`docker-compose.yml`**: full stack `postgres` + `mqtt` (Eclipse Mosquitto) +
  `migrate` + `api` + `web` dengan healthcheck dan dependency ordering.
- **Integrations**: helper `parseMode` yang gagal cepat untuk mode tidak dikenal
  (`MQTT_MODE=mock|mqtt`, `TASMOTA_MODE=mock|http`).
- **Ketahanan integrasi**: kegagalan connect adapter tidak lagi menggagalkan boot
  API; error dicatat lewat logger dan integrasi lain tetap berfungsi.
- **CI/CD**: workflow `ci.yml` (lint, typecheck, test, build, audit, build image
  Docker), workflow `release.yml` (build & push GHCR + GitHub Release dari tag),
  serta `.github/dependabot.yml` (pnpm + github-actions, mingguan, dikelompokkan).
- **Env**: validasi `JWT_SECRET`/`DATABASE_URL`/`CORS_ORIGIN` untuk produksi, dan
  `API_PORT` diparse sebagai number.

### Changed

- API dikonfigurasi ulang untuk ESM (`"type": "module"`), kompatibel dengan
  NestJS 12.
- Web memakai Next.js 15 + React 19 dengan output standalone untuk image Docker.
- `CORS_ORIGIN` `localhost` di produksi kini hanya memberi peringatan, bukan error,
  agar self-hosted di localhost tetap mungkin; `JWT_SECRET` yang lemah tetap ditolak.
- Override keamanan dipindahkan ke `pnpm-workspace.yaml`
  (`postcss ^8.5.23`, `deepmerge-ts ^8.0.0`) karena pnpm 12 mengabaikan
  `pnpm.overrides` di `package.json`.

### Security

- `pnpm audit --prod` bersih (0 advisory).
- Integrasi yang gagal connect (mis. broker MQTT mati) tidak lagi memblokir startup API.

## [0.1.0]

### Added

- Rilis awal NexaHome: homes/rooms/devices, automation & scenes, energy monitoring,
  activity log, Nexa AI (mode mock), MQTT/Tasmota/WiZ adapter, Prisma + PostgreSQL,
  Next.js dashboard.
