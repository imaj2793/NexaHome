<div align="center">

<img src="docs/assets/banner.svg" width="100%" alt="NexaHome — Your Home. Connected. Intelligent." />

### ✦ Satu pusat kendali untuk seluruh rumah, dikendalikan oleh suara ✦

[![version](https://img.shields.io/badge/version-0.1.0-6366f1?style=flat-square)](https://github.com/imaj2793/NexaHome)
[![phase](https://img.shields.io/badge/phase-1%E2%80%938%20%E2%9C%93-22d3ee?style=flat-square)](#-roadmap)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-22d3ee?style=flat-square)](https://github.com/imaj2793/NexaHome/pulls)
[![license](https://img.shields.io/badge/license-MIT-22d3ee?style=flat-square)](LICENSE)

[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![NestJS](https://img.shields.io/badge/NestJS-12-E0234E?style=flat-square&logo=nestjs&logoColor=white)](https://nestjs.com)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://prisma.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![pnpm](https://img.shields.io/badge/pnpm-12-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io)
[![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://postgresql.org)

</div>

---

**NexaHome** adalah platform **smart home open-source** — pusat kendali untuk semua perangkat IoT di rumah (lampu, sensor, AC, dan lainnya) lewat **antarmuka web** maupun **perintah suara**.

Pembedanya adalah **Nexa** — asisten AI yang memahami bahasa natural dan mengeksekusi perintah lewat **tool calling**. Nexa **bukan** LLM yang dilatih sendiri; ia jembatan antara bahasa manusia dan **NexaHome Core**.

> **Local-first · Modular · Provider-independent · Event-driven · Open-source**

---

## ✨ Kenapa NexaHome

| | |
| --- | --- |
| 🎙️ **Voice-first** | Ucapkan **"Hi Nexa, nyalakan lampu kamar"** — STT lokal (whisper.cpp) → DeepSeek → aksi. Tanpa kirim audio ke cloud. |
| 🧠 **AI sejati, bukan bot kaku** | Tool calling multi-langkah: Nexa bisa mencari perangkat dulu, baru bertindak. |
| 🔌 **Universal onboarding** | Temukan perangkat via mDNS/SSDP + Bluetooth — tidak terkunci satu vendor. |
| 🧩 **Modular** | Tambah integrasi baru (WiZ, MQTT, Tasmota, …) lewat kontrak `IntegrationAdapter`, tanpa ubah core. |
| 🏠 **Local-first** | Data & kontrol berjalan di perangkatmu; LLM gratis (DeepSeek), 0 biaya wajib. |
| 💰 **Tanpa lock-in** | Bukan layanan cloud berbayar — kamu pemilik penuh. |

---

## 🖥️ Tech Stack

| Lapisan | Teknologi |
| --- | --- |
| **Frontend** | Next.js 15 · React 19 · TypeScript · Tailwind CSS 4 |
| **Backend** | NestJS 12 · passport + JWT · WebSocket (Socket.IO) |
| **Database** | PostgreSQL 16 · Prisma 6 |
| **AI** | Provider abstraction (`@nexahome/ai`) — OpenAI-compatible (DeepSeek) / mock |
| **IoT** | WiZ (UDP) · MQTT · Tasmota — via `@nexahome/device-core` |
| **Monorepo** | pnpm workspaces · Turborepo |
| **Infra** | Docker Compose (Postgres + MQTT broker) |

---

## 🏗️ Arsitektur

```
🎙️ "Hi Nexa, nyalakan lampu kamar"
      │
      ▼
   STT lokal (whisper.cpp)
      │
      ▼
   Nexa AI (DeepSeek)
      │  tool_calls
      ▼
   Tool Calling ──▶ NexaHome Core ──▶ Integration ──▶ Device
      │                                     │  WiZ · MQTT · Tasmota
      ▼                                     ▼
   TTS (browser)                        💡 nyala
```

> **Prinsip utama:** Nexa **tidak** mengontrol perangkat secara langsung. Ia hanya meminta Core menjalankan *tool*. Keamanan, kepemilikan, dan routing ditangani Core — bukan model AI.

---

## 🚀 Quick Start

```bash
pnpm install

cp .env.example apps/api/.env

# PostgreSQL native (atau docker compose up -d postgres)
pnpm db:generate
pnpm db:migrate
pnpm db:seed

pnpm dev
```

| | |
| --- | --- |
| **Web** | http://localhost:3000 |
| **API** | http://localhost:3001/api |
| **Health** | http://localhost:3001/api/health |

<details>
<summary>🔑 Akun seed</summary>

```
Email:    owner@nexahome.local
Password: password123
```

</details>

---

## 🎙️ Nexa AI & Voice

Alur perintah suara **end-to-end**:

```
klik 🎤  →  "Hi Nexa, <perintah>"  →  STT lokal  →  DeepSeek  →  tool NexaHome  →  TTS 🔊
```

Voice berjalan **tanpa API eksternal** untuk STT/TTS:

```bash
# LLM — DeepSeek (OpenAI-compatible, gratis)
AI_PROVIDER="deepseek"
AI_API_KEY="sk-..."
AI_BASE_URL="https://api.deepseek.com/v1"
AI_MODEL="deepseek-chat"

# STT lokal — whisper.cpp (lihat docs/DEVELOPMENT.md §5)
WHISPER_BIN="whisper-cli"
WHISPER_MODEL="/path/ke/ggml-base.bin"
WHISPER_LANG="id"
```

**Tool yang tersedia:** `get_devices` · `turn_on_device` · `turn_off_device` · `set_brightness` · `set_color` · `set_temperature` · `get_room_status` · `activate_scene` · `create_automation` · `get_energy_usage`

---

## 🔌 Integrasi

| Integrasi | Protokol | Status |
| --- | --- | --- |
| **WiZ** | UDP | ✅ |
| **MQTT** (ESP32/sensor) | MQTT | ✅ |
| **Tasmota** | MQTT | 🚧 (dalam pengerjaan) |
| **Universal** (mDNS/SSDP + BLE) | DNS-SD / BLE | 🚧 (riset) |

Menambah integrasi baru cukup implementasikan kontrak `IntegrationAdapter` — tanpa menyentuh core. Lihat `docs/DEVELOPMENT.md` §8.

---

## 🧩 Fitur

- ✅ **Auth** — register/login JWT, kepemilikan per home.
- ✅ **Device management** — nyala/mati, kecerahan, warna, suhu.
- ✅ **Rooms & Scenes** — satu perintah atur banyak perangkat.
- ✅ **Automations** — jadwal & pemicu otomatis (scheduler).
- ✅ **Energy monitoring** — estimasi watt & kWh.
- ✅ **Notifications** — alert & aktivitas.
- ✅ **Nexa Visual** — robot 8 ekspresi, real-time via WebSocket.
- 🚧 **Voice penuh** — kode siap, menunggu uji live (API key).
- 🔬 **Onboarding universal** — mDNS/SSDP + Bluetooth.

---

## 📚 Dokumentasi

| Dokumen | Isi |
| --- | --- |
| [`docs/PRD.md`](docs/PRD.md) | Visi, fitur, roadmap produk |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | **Tahapan menuju distribusi v1.0** |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Setup & panduan kontribusi |
| [`docs/API.md`](docs/API.md) | Referensi endpoint |
| [`BLUEPRINT.md`](BLUEPRINT.md) | Desain arsitektur teknis |
| [`IDEA.md`](IDEA.md) | Konsep awal |

---

## 🗺️ Roadmap

| Phase | Isi | Status |
| --- | --- | --- |
| 1 — Foundation | monorepo, auth, homes/rooms/devices, dashboard | ✅ |
| 2 — Smart Home | device core, WiZ, WebSocket | ✅ |
| 3 — Nexa AI | provider abstraction, tool calling, TTS | ✅ |
| 4 — Visual Nexa | robot 8 ekspresi + animasi | ✅ |
| 5 — Automation | scenes, scheduler, triggers, actions | ✅ |
| 6 — IoT | integrasi MQTT | ✅ |
| 7 — Advanced | notifications, energy monitoring | ✅ |
| 8 — v1.0 | dokumentasi, security hardening | ✅ |
| **9 — Voice penuh** | DeepSeek live + STT lokal + wake word | 🚧 |
| **10 — Onboarding universal** | mDNS/SSDP + Bluetooth | 🔬 |

> Tahapan detail menuju rilis ada di [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## 🤝 Kontribusi

Kami terbuka untuk kontribusi. Lihat [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) untuk setup, struktur repo, dan konvensi.

- **Bahasa**: komentar & commit berbahasa Indonesia.
- **Commit**: imperative lowercase (`feat: …`, `fix: …`, `chore: …`).
- **Verifikasi sebelum commit**: `pnpm run typecheck && pnpm run build`.

---

## 📄 License

Dirilis di bawah **[MIT License](LICENSE)** — bebas digunakan, dimodifikasi, dan didistribusikan, termasuk untuk keperluan komersial.

© 2026 [imaj2793](https://github.com/imaj2793) · NexaHome contributors

<div align="center">

**Made with ⚡ by [imaj2793](https://github.com/imaj2793)**

</div>
