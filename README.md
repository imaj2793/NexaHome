# NexaHome

> **Your Home. Connected. Intelligent.**

NexaHome adalah platform **smart home open-source** — pusat untuk mengelola perangkat rumah, automation, scenes, monitoring, dan asisten AI bernama **Nexa**. 
## Tech Stack

| Lapisan | Teknologi |
| --- | --- |
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS 4 |
| Backend | NestJS 12, TypeScript, passport + JWT |
| Database | PostgreSQL 16, Prisma 6 |
| Monorepo | pnpm workspaces + Turborepo |
| Infra | Docker Compose (Postgres + MQTT broker) |

## Struktur

```
nexahome/
├── apps/
│   ├── web/          # Next.js — dashboard, login
│   └── api/          # NestJS — auth, homes, rooms, devices, integrations
├── packages/
│   └── types/        # @nexahome/types — shared TS types + Zod schemas
├── docker/           # config MQTT
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

> Catatan: blueprint menyebut `prisma/` di root — implementasinya ada di `apps/api/prisma/`. Akan diekstrak ke package `@nexahome/db` saat ada konsumen kedua (worker/automation engine).

## Quick Start

```bash
# 1. install dependensi
pnpm install

# 2. siapkan env (sekali)
cp .env.example apps/api/.env

# 3. jalankan PostgreSQL (+ MQTT untuk phase IoT)
docker compose up -d postgres

# 4. generate client + migrasi + seed
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 5. jalankan semua (web + api)
pnpm dev
```

- **Web**: http://localhost:3000
- **API**: http://localhost:3001/api
- **Health**: http://localhost:3001/api/health

## Akun Seed

```
Email:    owner@nexahome.local
Password: password123
```

## Perintah Berguna

```bash
pnpm build          # build semua package (turbo)
pnpm typecheck      # type-check semua package
pnpm db:studio      # buka Prisma Studio
pnpm db:migrate     # buat/terapkan migrasi (dev)
```

## API Utama (Phase 1)

```
POST /api/auth/register       POST /api/auth/login
GET  /api/auth/me
GET/POST /api/homes           GET/PATCH/DELETE /api/homes/:id
GET/POST /api/rooms           GET/PATCH/DELETE /api/rooms/:id
GET/POST /api/devices         GET/PATCH/DELETE /api/devices/:id
POST /api/devices/:id/commands   # turn_on / turn_off / set_brightness
GET/POST /api/integrations
GET  /api/activity-log
GET  /api/health
```

Semua endpoint (kecuali register/login/health) butuh header `Authorization: Bearer <token>`.

## Roadmap

- **Phase 1 — Foundation** ✅ *(saat ini)*: monorepo, auth, database, homes/rooms/devices, dashboard.
- **Phase 2 — Smart Home**: WiZ integration, device core, WebSocket, scenes.
- **Phase 3 — Nexa AI**: AI API, voice, tool calling, TTS.
- **Phase 4 — Visual Nexa**: robot UI + ekspresi.
- **Phase 5 — Automation**, **Phase 6 — IoT (MQTT/ESP32)**, **Phase 7 — Advanced**, **Phase 8 — v1.0**.

## License

Open-source — bebas dikembangkan komunitas.
