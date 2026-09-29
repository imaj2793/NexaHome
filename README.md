# NexaHome

> **Your Home. Connected. Intelligent.**

NexaHome adalah platform **smart home open-source** — pusat untuk mengelola perangkat rumah, automation, scenes, monitoring energi, dan asisten AI bernama **Nexa**.

## Tech Stack

| Lapisan | Teknologi |
| --- | --- |
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS 4 |
| Backend | NestJS 12, TypeScript, passport + JWT |
| Database | PostgreSQL 16, Prisma 6 |
| AI | Provider abstraction (`@nexahome/ai`) — OpenAI-compatible / mock |
| IoT | WiZ (UDP) + MQTT (ESP32/sensor) via `@nexahome/device-core` |
| Monorepo | pnpm workspaces + Turborepo |
| Infra | Docker Compose (Postgres + MQTT broker) |

## Struktur

```
nexahome/
├── apps/
│   ├── web/                    # Next.js — login, dashboard, chat Nexa
│   └── api/                    # NestJS — auth, homes, rooms, devices,
│                               #   scenes, automations, notifications, energy, nexa
├── packages/
│   ├── types/                  # @nexahome/types — shared TS + Zod
│   ├── device-core/            # @nexahome/device-core — kontrak adapter + manager
│   ├── ai/                     # @nexahome/ai — AI + speech provider
│   └── integration-mqtt/       # @nexahome/integration-mqtt — adapter MQTT
├── integrations/
│   └── wiz/                    # @nexahome/integration-wiz — adapter WiZ
├── docker/                     # config MQTT (mosquitto)
├── docker-compose.yml
└── pnpm-workspace.yaml
```

> Catatan: blueprint menyebut `prisma/` di root — implementasinya di `apps/api/prisma/`.

## Quick Start

```bash
pnpm install

cp .env.example apps/api/.env

# PostgreSQL native (atau docker compose up -d postgres)
pnpm db:generate
pnpm db:migrate
pnpm db:seed

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
pnpm db:migrate     # migrasi (dev)
pnpm db:seed        # seed (owner + home + device + scene + automation)
```

## API

```
# Auth
POST /api/auth/register        POST /api/auth/login         GET /api/auth/me

# Homes / Rooms / Devices / Integrations
GET/POST /api/homes            GET/PATCH/DELETE /api/homes/:id
GET/POST /api/rooms            GET/PATCH/DELETE /api/rooms/:id
GET/POST /api/devices          GET/PATCH/DELETE /api/devices/:id
POST /api/devices/:id/commands           # turn_on / turn_off / set_brightness / set_color
GET/POST /api/integrations     POST /api/integrations/:id/discover

# Scenes (Phase 5)
GET/POST /api/scenes           GET/PATCH/DELETE /api/scenes/:id
POST /api/scenes/:id/activate

# Automations (Phase 5)
GET/POST /api/automations      GET/PATCH/DELETE /api/automations/:id
POST /api/automations/:id/run

# Notifications & Energy (Phase 7)
GET /api/notifications         PATCH /api/notifications/:id/read
PATCH /api/notifications/read-all        DELETE /api/notifications/:id
GET /api/energy/summary

# Nexa AI (Phase 3–4)
POST /api/nexa/chat            POST /api/nexa/speech
GET  /api/activity-log         GET /api/health
```

Semua endpoint (kecuali register/login/health) butuh header `Authorization: Bearer <token>`.

## Nexa AI

Nexa **bukan** AI yang mengontrol rumah langsung — Nexa hanya menjembatani perintah user ke **NexaHome Core** via **tool calling**:

```
Nexa AI → Tool Calling → NexaHome Core → Integration → Device
```

Provider AI bisa diganti (default `mock`, ganti ke `openai` via `AI_PROVIDER=openai` + `AI_API_KEY`). Tool yang tersedia: `get_devices`, `turn_on_device`, `turn_off_device`, `set_brightness`, `set_color`, `set_temperature`, `get_room_status`, `activate_scene`, `create_automation`, `get_energy_usage`.

## Roadmap

- **Phase 1 — Foundation** ✅ monorepo, auth, homes/rooms/devices, dashboard.
- **Phase 2 — Smart Home** ✅ WiZ integration, device core, WebSocket.
- **Phase 3 — Nexa AI** ✅ provider abstraction, tool calling, TTS.
- **Phase 4 — Visual Nexa** ✅ robot UI + 8 ekspresi + animasi + full-screen.
- **Phase 5 — Automation** ✅ scenes, scheduler, triggers, conditions, actions.
- **Phase 6 — IoT** ✅ MQTT integration (adapter + mock).
- **Phase 7 — Advanced** ✅ notifications, energy monitoring.
- **Phase 8 — v1.0** 🚧 dokumentasi, security hardening, stable API.

## License

Open-source — bebas dikembangkan komunitas.
