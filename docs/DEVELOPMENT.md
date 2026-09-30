# NexaHome — Panduan Pengembangan

Panduan untuk pengembang yang baru bergabung: cara setup, struktur repo, dan cara menambah fitur/integrasi.

---

## 1. Prasyarat

| Alat | Versi | Catatan |
| --- | --- | --- |
| Node.js | ≥ 20 | pnpm 12 |
| pnpm | 12.x | package manager (workspaces) |
| PostgreSQL | 16+ | bisa native Homebrew atau Docker |
| ffmpeg | — | konversi audio untuk STT |
| whisper.cpp | — | STT lokal (lihat §5) |
| Docker (opsional) | — | untuk broker MQTT (mosquitto) |

---

## 2. Setup Cepat

```bash
pnpm install

cp .env.example apps/api/.env   # lalu isi DATABASE_URL, JWT_SECRET, dst.

# Database (native Homebrew atau docker compose up -d postgres)
pnpm db:generate
pnpm db:migrate
pnpm db:seed                     # buat owner + home + device + scene + automation

pnpm dev                         # web (3000) + api (3001)
```

- **Web**: http://localhost:3000
- **API**: http://localhost:3001/api
- **Health**: http://localhost:3001/api/health
- **Akun seed**: `owner@nexahome.local` / `password123`

---

## 3. Environment Variables

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `DATABASE_URL` | — | koneksi PostgreSQL |
| `JWT_SECRET` | — | secret JWT |
| `JWT_EXPIRES_IN` | `7d` | masa berlaku token |
| `API_PORT` | `3001` | port backend |
| `CORS_ORIGIN` | `http://localhost:3000` | origin yang diizinkan |
| `AI_PROVIDER` | `mock` | `mock` / `deepseek` / `openai` |
| `AI_API_KEY` | — | key provider (wajib untuk DeepSeek) |
| `AI_BASE_URL` | `https://api.deepseek.com/v1` | endpoint OpenAI-compatible |
| `AI_MODEL` | `deepseek-chat` | model chat |
| `WHISPER_BIN` | `whisper-cli` | binary whisper.cpp |
| `WHISPER_MODEL` | — | path model ggml (wajib untuk STT) |
| `WHISPER_LANG` | `id` | bahasa transkripsi |
| `MQTT_URL` | `mqtt://localhost:1883` | broker MQTT |

---

## 4. Perintah Berguna

```bash
pnpm build            # build semua package (turbo)
pnpm typecheck        # type-check semua package
pnpm db:generate      # regenerate Prisma client
pnpm db:migrate       # migrasi (dev)
pnpm db:seed          # seed data demo
pnpm db:studio        # Prisma Studio
```

---

## 5. Voice & STT (whisper.cpp)

STT berjalan **lokal** — tidak ada audio yang dikirim ke cloud.

```bash
# macOS
brew install whisper-cpp

# Linux (target i3/12GB): build dari https://github.com/ggml-org/whisper.cpp

# unduh model ggml (base ~141MB; tiny ~75MB lebih cepat)
curl -L -o models/ggml-base.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
```

Lalu isi `.env`:

```bash
WHISPER_BIN="whisper-cli"
WHISPER_MODEL="/path/ke/models/ggml-base.bin"
WHISPER_LANG="id"
```

> `ffmpeg` wajib ada (konversi WebM/Opus dari browser → WAV 16kHz mono).

---

## 6. LLM (DeepSeek)

DeepSeek adalah API OpenAI-compatible (chat-only — **tanpa** endpoint audio).

```bash
AI_PROVIDER="deepseek"
AI_API_KEY="sk-..."                 # API key DeepSeek
AI_BASE_URL="https://api.deepseek.com/v1"
AI_MODEL="deepseek-chat"
```

TTS memakai `speechSynthesis` browser (fallback otomatis) karena DeepSeek tidak punya TTS.

---

## 7. Struktur Monorepo

```
apps/
  web/                    # Next.js 15 — login, dashboard, chat Nexa
  api/                    # NestJS 12 — modul REST + WebSocket + Nexa
packages/
  types/                  # @nexahome/types — shared TS + Zod
  device-core/            # @nexahome/device-core — kontrak IntegrationAdapter + manager
  ai/                     # @nexahome/ai — provider chat + speech (mock/openai-compatible)
  integration-mqtt/       # @nexahome/integration-mqtt — adapter MQTT
  integration-tasmota/    # @nexahome/integration-tasmota — adapter Tasmota (HTTP)
docs/                     # PRD, API, DEVELOPMENT (ini)
models/                   # model ggml STT (gitignored)
```

---

## 8. Menambah Integrasi Perangkat Baru

1. Buat package baru (mis. `integrations/mysmart/`).
2. Implementasikan kontrak `IntegrationAdapter` dari `@nexahome/device-core`:

```ts
import { IntegrationAdapter, DiscoveredDevice, IntegrationCommand } from '@nexahome/device-core';

export class MyAdapter implements IntegrationAdapter {
  readonly type = 'MYPROTO' as const;
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async discoverDevices(): Promise<DiscoveredDevice[]> { /* ... */ }
  async getDeviceState(deviceId: string): Promise<Record<string, unknown>> { /* ... */ }
  async executeCommand(deviceId: string, cmd: IntegrationCommand): Promise<Record<string, unknown>> { /* ... */ }
}
```

3. Daftarkan di `apps/api/src/device-core/device-core.module.ts` (factory provider, baca config dari env).
4. Tambah ke `DeviceCoreService.onModuleInit()` (register + connect).
5. Mode `mock` untuk dev tanpa broker (pola lihat `integration-mqtt`). Ingat: mock berarti 0 perangkat, bukan data simulasi.

---

## 9. Menambah Tool Nexa

1. Tambah definisi di `nexa-tools.service.ts` (`getToolDefinitions()`).
2. Tambah case di `execute()` + method handler.
3. Tool **wajib** return `NexaToolResult` (jangan throw — safety layer).

---

## 10. Konvensi

- **Bahasa**: komentar & commit berbahasa Indonesia.
- **Commit**: imperative lowercase (`feat: ...`, `fix: ...`, `chore: ...`).
- **Verifikasi sebelum commit**: `pnpm run typecheck && pnpm run build`.
- **KISS/DRY**: ikuti gaya modul tetangga; jangan refactor di luar cakupan.
- Schema Prisma di `apps/api/prisma/schema.prisma` (bukan di root).
