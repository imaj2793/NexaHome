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
  (`MQTT_MODE=mock|mqtt`, `TASMOTA_MODE=mock|http`, `WIZ_MODE=mock|udp`).
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
