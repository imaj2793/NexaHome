# Arsitektur NexaHome

Dokumen ini menjelaskan struktur NexaHome **seperti yang ada di kode sekarang**.
Kalau sebuah bagian belum ada, dokumen inisays "belum ada" — bukan Minus.

## 1. Bentuk besar

```text
Web (Next.js)
  │  REST + WebSocket
  ▼
API (NestJS)
  ├── Auth            JWT access + refresh rotasi
  ├── Homes/Room      anggota rumah (owner + member)
  ├── Devices         Device Registry (PostgreSQL)
  ├── Discovery       mDNS + adapter scan + connect manual
  ├── DeviceCore      Command Engine + IntegrationManager
  ├── Nexa            AI → tool → Command Engine
  ├── Scenes          kumpulan perintah
  ├── Automation      trigger schedule
  ├── Notifications   (write path belum terpasang)
  ├── Energy          estimasi (bukan pengukuran)
  └── ActivityLog     jejak perintah
        │
        ▼
packages/device-core      kontrak IntegrationAdapter + IntegrationManager
packages/integration-*    MqttAdapter, TasmotaAdapter
packages/ai              provider AI + speech (mock & OpenAI-compatible)
packages/types           tipe + schema Zod yang dipakai web & api
```

Prinsip yang dipegang: **core tidak tahu vendor apa pun**. `DeviceCoreService`
hanya mengenal `IntegrationAdapter` (5 method), dan `NexaService` hanya mengenal
tool yang memanggil `DeviceCoreService`. Menambah vendor berarti menambah
adapter, bukan mengubah command engine.

## 2. Alur satu perintah

```text
POST /devices/:id/commands  { action, value }
  → validasi DTO
  → DevicesService: device milik user (owner ATAU anggota)
  → DeviceCoreService.executeCommand
       1. toIntegrationCommand(action) → capability netral
       2. assertCapabilitySupported  ← perangkat tidak bisa dst
       3. assertValueInRange        ← nilai tak masuk akal ditolak
       4. cek state.online === false → DEVICE_OFFLINE
       5. IntegrationManager.executeCommand → adapter
       6. simpan state, tulis ActivityLog, emit WebSocket
  → CommandResult
```

AI tidak pernah menyentuh perangkat secara langsung: `NexaService` →
`NexaToolsService.runDeviceCommand` → `DeviceCoreService.executeCommand`.
Semua jalur melewati validasi yang sama.

## 3. Device Registry

`Device` (tabel) adalah sumber kebenaran untuk device yang sudah terhubung:

| Field | Arti |
| --- | --- |
| `id` | id internal (cuid) |
| `externalId` | id menurut adapter (mis. IP Tasmota) |
| `integrationId` | integration mana yang mengerjakannya |
| `capabilities` | capability yang **benar-benar** dikuasai |
| `state` | JSON state terakhir |
| `type`, `roomId` | klasifikasi & lokasi |

Perangkat yang belum terhubung **tidak** ada di tabel. Itu hasil
`DiscoveryService.scan()`, lalu disimpan lewat `POST /integrations/:id/connect`.

### Batasan yang perlu diketahui

- `brand` dan `model` belum jadi kolom. Yang ada: `name`, `type`, `externalId`.
- Tidak ada kolom `connection status`. Dashboard menghitung perangkat aktif dari
  isi `state`, bukan dari heartbeat broker.
- `IntegrationType` masih enum tertutup 5 nilai
  (`MQTT | ESP32 | HOME_ASSISTANT | TASMOTA | SHELLY`). Menambah nilai berarti
  mengubah `schema.prisma` **dan** `packages/device-core/src/integration.ts`.
  Untuk itu `ESP32`, `HOME_ASSISTANT`, dan `SHELLY` sudah punya nilai enum tapi
  belum punya adapter — hasil scan ke arah itu akan gagal saat diperintah.
- `DeviceType` belum diselaraskan ke daftar di §4 spec
  (`light/air_conditioner/fan/tv/switch/plug/sensor/unknown`). Yang dipakai
  sekarang ada di `packages/types/src/device.ts`: `light, switch, sensor,
  climate, media, lock, camera, other`. Kolom `type` di DB berupa string bebas,
  sehingga nilainya tidak ditegakkan di level database.

## 4. Automation

`Automation` = trigger + actions, dieksekusi lewat `DeviceCoreService` yang
sama dengan perintah manual (tidak ada jalur eksekusi terpisah).

Kondisi saat ini, jujur:

- Trigger yang **benar-benar dievaluasi**: `SCHEDULE` saja, lewat
  `setInterval(30s)` di dalam proses API yang mencocokkan string `HH:mm`.
- Trigger `DEVICE_STATE` dan `SENSOR` **ada di enum tapi tidak pernah
  dievaluasi** — hanya `SCHEDULE` yang dibaca di `tick()`.
- **Belum ada kondisi (IF)**. `AutomationTrigger` tidak punya condition.
- `lastFiredMinute` disimpan di memori: restart API berarti jadwal menit itu
  terlewat, dan hanya satu instance API yang evaluates jadwal (tidak aman bila
  dijalankan multi-replica).

## 5. Realtime

`DeviceGateway` (socket.io):

- Client wajib mengirim access token saat handshake (`auth.token`).
- Setelah connect, client mengirim `home:join`; server mengecek keanggotaan
  lalu dimasukkan ke room `home:<id>`.
- Semua emit memakai room. Tidak ada broadcast global.
- Event: `device:state` dan `nexa.state`.
- Yang **belum** ada: push state dari perangkat ke dashboard. State hanya
  terkirim setelah perintah dieksekusi dari dashboard/Nexa.

## 6. Yang sengaja tidak ada

Supaya tidak ada yang mengira fiturnya ada:

| Fitur | Status |
| --- | --- |
| Google Home / Matter / Tuya / SmartThings / IR | tidak ada satu baris pun |
| BLE | tidak ada |
| WiZ | dihapus; alasannya di [ROADMAP](ROADMAP.md) |
| `NotificationsService.notify()` | ada metodenya, tidak ada pemanggil |
| Energy summary | menjumlahkan watt dari tabel statis, bukan meteran |
| `getDeviceState()` di kedua adapter | ada, tidak dipanggil kode produksi |
| `AutomationTrigger` `DEVICE_STATE`/`SENSOR` | enum saja |
| Detail driver di `Energy` | nilai hardcode, bukan pengukuran |

## 7. Referensi

- Model device: [device-model.md](device-model.md)
- Integrasi: [integrations.md](integrations.md)
- Autentikasi & otorisasi: [authentication.md](authentication.md)
- AI & voice: [voice.md](voice.md)
- Automation: [automation.md](automation.md)
- Menjalankan & mengembangkan: [DEVELOPMENT.md](DEVELOPMENT.md)
- Deployment: [DEPLOYMENT.md](DEPLOYMENT.md)
