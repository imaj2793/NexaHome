# NexaHome

> **Your Home. Connected. Intelligent.**

**NexaHome** adalah platform smart home open-source yang menjadi pusat untuk mengelola perangkat rumah, automation, scenes, monitoring, dan AI assistant bernama **Nexa**.

NexaHome dirancang dengan pendekatan **local-first, modular, extensible**, sehingga perangkat dan layanan dapat ditambahkan tanpa mengubah keseluruhan sistem.

> **Status (Sep 2026):** Phase 1–8 ✅ selesai. Dokumen aktif: [`docs/PRD.md`](docs/PRD.md) (produk), [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) (setup & kontribusi), [`docs/API.md`](docs/API.md) (endpoint). Blueprint ini adalah desain referensi awal; sebagian telah berevolusi (mis. state robot → 8 ekspresi) — utamakan dokumen `docs/` untuk kondisi terkini.

---

# 1. Konsep Utama

NexaHome terdiri dari dua bagian utama:

```text
┌─────────────────────────────────────┐
│             NEXAHOME                │
│                                     │
│  Smart Home Platform                │
│                                     │
│  ┌─────────────┐  ┌──────────────┐  │
│  │ Smart Home  │  │   Nexa AI    │  │
│  │    Core     │  │  Assistant   │  │
│  └─────────────┘  └──────────────┘  │
└─────────────────────────────────────┘
```

### NexaHome Core

Bertanggung jawab terhadap:

- Device management
- Room management
- Device state
- Automation
- Scenes
- Schedules
- History
- Notifications
- Energy monitoring
- Integrations

### Nexa AI

Bertanggung jawab terhadap:

- Voice command
- Natural language understanding
- Tool calling
- AI response
- AI state
- Visual expressions

Nexa **tidak mengontrol perangkat secara langsung**.

Nexa meminta NexaHome Core menjalankan sebuah tool.

---

# 2. Prinsip Arsitektur

NexaHome menggunakan beberapa prinsip utama:

### Local-first

Data dan kontrol perangkat sebisa mungkin berjalan di perangkat pengguna.

### API-driven

Frontend, Nexa AI, dan integrasi berkomunikasi melalui API.

### Modular

Integrasi perangkat dibuat sebagai module/plugin terpisah.

### Provider-independent

Nexa AI tidak dikunci pada satu provider.

Model AI dapat diganti tanpa mengubah NexaHome Core.

### Event-driven

Perubahan perangkat dan status Nexa dikirim sebagai event.

### Open-source

Komponen utama dirancang agar mudah dipelajari, dikembangkan, dan dikontribusikan komunitas.

---

# 3. Arsitektur High-Level

```text
                         USER
                          │
             ┌────────────┴────────────┐
             │                         │
          Web UI                  Voice Input
             │                         │
             └────────────┬────────────┘
                          │
                     NexaHome API
                          │
          ┌───────────────┼────────────────┐
          │               │                │
       Dashboard       Nexa AI          WebSocket
          │               │                │
          │          AI API Provider       │
          │               │                │
          │          Tool Calling          │
          │               │                │
          └───────────────┼────────────────┘
                          │
                    NexaHome Core
                          │
       ┌──────────────────┼──────────────────┐
       │                  │                  │
   Device Core        Automation          Scenes
       │                  │                  │
       └──────────────────┼──────────────────┘
                          │
                 Integration Layer
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
       WiZ               MQTT             ESP32
        │                 │                 │
     Devices           Devices          Sensors
```

---

# 4. Tech Stack

## Frontend

```text
Next.js
TypeScript
Tailwind CSS
shadcn/ui
WebSocket
```

### Fungsi

Frontend digunakan untuk:

- Dashboard
- Device control
- Room management
- Automation builder
- Scene management
- Nexa Visual Mode
- History
- Settings

---

# 5. Backend

```text
NestJS
TypeScript
Prisma
PostgreSQL
WebSocket
```

NestJS menjadi pusat API NexaHome.

Backend menangani:

```text
Authentication
Users
Devices
Rooms
Scenes
Automations
AI
Integrations
Events
Notifications
History
```

---

# 6. Database

Database utama:

```text
PostgreSQL
```

Entity utama:

```text
User
Home
Room
Device
DeviceState
Integration
Scene
SceneAction
Automation
AutomationTrigger
AutomationAction
ActivityLog
Notification
AIConversation
AIMessage
AICommand
```

Relasi sederhananya:

```text
User
 │
 └── Home
      │
      ├── Rooms
      │    └── Devices
      │
      ├── Scenes
      │
      ├── Automations
      │
      └── Integrations
```

---

# 7. Device Model

Setiap perangkat menggunakan model abstrak.

Contoh:

```json
{
  "id": "device_001",
  "name": "Lampu Ruang Tamu",
  "type": "light",
  "room": "living_room",
  "integration": "wiz",
  "capabilities": [
    "power",
    "brightness",
    "color",
    "temperature"
  ],
  "state": {
    "power": true,
    "brightness": 80
  }
}
```

Dengan model ini, Nexa tidak perlu mengetahui bagaimana perangkat bekerja.

Nexa hanya mengetahui:

```text
device
capabilities
state
```

Integration layer yang menangani komunikasi sebenarnya.

---

# 8. Integration Layer

Semua perangkat berada di belakang integration layer.

```text
NexaHome Core
      │
Integration Manager
      │
 ┌────┼─────┬────────────┐
 │    │     │            │
WiZ  MQTT  ESP32   Home Assistant
```

Setiap integration memiliki interface standar.

Contoh:

```text
connect()
disconnect()
discoverDevices()
getDeviceState()
executeCommand()
```

Dengan demikian integrasi baru dapat ditambahkan tanpa mengubah core.

---

# 9. WiZ Integration

WiZ menjadi salah satu integration pertama.

Alur:

```text
NexaHome
   ↓
WiZ Integration
   ↓
WiZ Device
```

Contoh:

```text
turn_on_device
       ↓
Device Core
       ↓
WiZ Adapter
       ↓
WiZ Smart Bulb
```

Nexa tidak berkomunikasi langsung dengan WiZ.

---

# 10. MQTT Integration

MQTT digunakan untuk perangkat IoT seperti:

- ESP32
- Sensor
- Relay
- Temperature sensor
- Motion sensor
- Custom IoT devices

Arsitektur:

```text
ESP32
  │
  │ MQTT
  ↓
MQTT Broker
  │
  ↓
NexaHome MQTT Integration
  │
  ↓
NexaHome Core
```

---

# 11. Nexa AI

Nexa menggunakan **AI API dari model yang sudah tersedia**.

Tidak ada kebutuhan training LLM sendiri pada versi awal.

Arsitektur:

```text
User
 ↓
Speech-to-Text
 ↓
Nexa AI Service
 ↓
AI API
 ↓
Tool Calling
 ↓
NexaHome Core
```

AI provider dibuat abstraction layer:

```text
Nexa AI
   │
AI Provider Interface
   │
 ┌─┴───────────┐
 │             │
Provider A   Provider B
```

Dengan demikian API provider dapat diganti tanpa mengubah sistem Nexa.

---

# 12. Voice Pipeline

Voice command merupakan fungsi utama Nexa.

Pipeline:

```text
🎙️ Microphone
      ↓
Speech-to-Text
      ↓
Text
      ↓
Nexa AI
      ↓
Intent / Tool
      ↓
NexaHome Core
      ↓
Device
      ↓
Result
      ↓
Nexa AI
      ↓
Text-to-Speech
      ↓
🔊 Voice Response
```

Contoh:

> "Nexa, matikan lampu ruang tamu."

Menjadi:

```json
{
  "tool": "turn_off_device",
  "arguments": {
    "device_id": "living_room_light"
  }
}
```

---

# 13. Nexa Tools

Tools adalah jembatan antara AI dan NexaHome.

Tools awal:

```text
get_devices()
get_device_status()
turn_on_device()
turn_off_device()
set_brightness()
set_color()
set_temperature()
get_room_status()
activate_scene()
create_automation()
get_energy_usage()
```

AI tidak diberikan akses database secara langsung.

AI hanya diberikan tools yang diperbolehkan.

---

# 14. Tool Calling Flow

```text
User
 │
 │ "Nyalakan lampu kamar"
 ↓
Nexa AI
 │
 │ tool_call
 ↓
turn_on_device()
 │
 ↓
NexaHome Core
 │
 ↓
Device Manager
 │
 ↓
WiZ Integration
 │
 ↓
Lampu
 │
 │ ON
 ↓
Result
 │
 ↓
Nexa AI
 │
 ↓
"Siap, lampu kamar sudah menyala."
```

---

# 15. Nexa Visual Mode

Nexa memiliki dua mode.

## Headless Mode

Tidak menggunakan visual avatar.

```text
Voice
API
CLI
Automation
```

## Visual Mode

Menggunakan interface robot/avatar.

```text
Nexa Visual Interface
        │
        ↓
Nexa State
        │
        ↓
Animation Engine
```

---

# 16. Nexa State

State standar:

```text
IDLE
LISTENING
THINKING
SPEAKING
HAPPY
CONFUSED
WARNING
ERROR
SLEEPING
EXCITED
```

Contoh:

```text
User mulai bicara
      ↓
LISTENING
      ↓
AI memproses
      ↓
THINKING
      ↓
Perintah berhasil
      ↓
HAPPY
      ↓
Nexa menjawab
      ↓
SPEAKING
      ↓
IDLE
```

---

# 17. Nexa Event Protocol

Visual UI tidak perlu mengetahui proses internal AI.

Nexa AI cukup mengirim event.

Contoh:

```json
{
  "type": "nexa.state",
  "state": "THINKING"
}
```

Kemudian:

```json
{
  "type": "nexa.state",
  "state": "SPEAKING",
  "message": "Lampu sudah dinyalakan."
}
```

Frontend menerjemahkan state tersebut menjadi animasi.

---

# 18. Scene

Scene memungkinkan beberapa perangkat dikontrol sekaligus.

Contoh:

```text
Scene: Movie Night

TV            → ON
Lampu          → 20%
Lampu RGB      → Purple
AC             → 24°C
```

User cukup mengatakan:

> "Nexa, aktifkan movie night."

Flow:

```text
Voice
 ↓
Nexa AI
 ↓
activate_scene("movie_night")
 ↓
NexaHome Core
 ↓
Multiple Device Commands
```

---

# 19. Automation

Automation menggunakan konsep:

```text
TRIGGER
   ↓
CONDITION
   ↓
ACTION
```

Contoh:

```text
Trigger:
18:00

Condition:
Nobody is sleeping

Action:
Turn on living room light
```

Contoh lain:

```text
Trigger:
Motion detected

Condition:
Time > 18:00

Action:
Turn on hallway light
```

---

# 20. Automation Engine

```text
Event
 ↓
Automation Engine
 ↓
Find Matching Rules
 ↓
Check Conditions
 ↓
Execute Actions
 ↓
Device Core
```

Automation berjalan secara terpisah dari AI.

AI hanya membantu pengguna membuat atau mengubah automation.

---

# 21. AI + Automation

User:

> "Nexa, setiap jam 6 sore nyalakan lampu teras."

Nexa:

```text
Understand Request
       ↓
create_automation()
       ↓
Automation Engine
       ↓
Schedule: 18:00
       ↓
Action: Turn On Porch Light
```

AI tidak menjalankan scheduler.

Scheduler tetap menjadi tanggung jawab NexaHome.

---

# 22. WebSocket

WebSocket digunakan untuk real-time updates.

Contoh:

```text
Device ON
   ↓
Backend Event
   ↓
WebSocket
   ↓
Dashboard
   ↓
UI berubah menjadi ON
```

Juga digunakan untuk:

- Nexa state
- Voice status
- Device status
- Automation events
- Notifications

---

# 23. REST API

REST API digunakan untuk operasi umum.

Contoh:

```text
GET    /api/devices
GET    /api/devices/:id
POST   /api/devices/:id/commands

GET    /api/rooms
POST   /api/rooms

GET    /api/scenes
POST   /api/scenes

GET    /api/automations
POST   /api/automations

POST   /api/nexa/chat
POST   /api/nexa/voice
```

WebSocket digunakan untuk event real-time.

---

# 24. Authentication

Sistem menggunakan authentication untuk mengamankan dashboard dan API.

Konsep:

```text
User
 ↓
Login
 ↓
Authentication
 ↓
Access Token
 ↓
API
```

Role dasar:

```text
OWNER
ADMIN
USER
```

API key provider AI disimpan di backend/server.

**API key tidak boleh dikirim ke browser.**

---

# 25. Security

Prinsip keamanan:

- API key hanya di server
- Password di-hash
- Authentication pada API
- Authorization berdasarkan role
- Validasi input
- Rate limiting
- Audit log
- Device command validation
- Tool whitelist
- Environment variables untuk secrets

AI tidak boleh memiliki akses bebas ke sistem operasi.

---

# 26. AI Safety Layer

Sebelum tool dijalankan:

```text
AI Tool Call
     ↓
Tool Validator
     ↓
Permission Check
     ↓
Argument Validation
     ↓
Device Validation
     ↓
Execute
```

Contoh:

```text
AI:
turn_off_device("abc")

       ↓

Apakah device ada?
       ↓
Apakah user punya akses?
       ↓
Apakah command valid?
       ↓
Execute
```

---

# 27. Memory

Nexa tidak perlu menyimpan semua percakapan selamanya.

Memory dapat dibagi:

### Short-term

Percakapan aktif.

### User Preferences

Contoh:

```text
Preferred language: Indonesian
Preferred brightness: 40%
```

### Device Context

Data perangkat diambil secara real-time dari NexaHome.

---

# 28. Data Flow

Secara keseluruhan:

```text
             USER
               │
        ┌──────┴──────┐
        │             │
      Voice          Web
        │             │
        ↓             ↓
 Speech-to-Text    Next.js
        │             │
        └──────┬──────┘
               ↓
          NestJS API
               │
        ┌──────┴───────┐
        │              │
     Nexa AI       Home Core
        │              │
    AI Provider    Device Core
        │              │
   Tool Calling   Integration
                       │
          ┌────────────┼────────────┐
          │            │            │
         WiZ          MQTT         ESP32
```

---

# 29. Repository Structure

```text
nexahome/
│
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   └── lib/
│   │
│   └── api/
│       ├── src/
│       ├── modules/
│       └── main.ts
│
├── packages/
│   ├── ui/
│   ├── types/
│   ├── config/
│   ├── device-core/
│   ├── automation/
│   ├── ai/
│   ├── events/
│   └── integrations/
│
├── integrations/
│   ├── wiz/
│   ├── mqtt/
│   ├── esp32/
│   └── home-assistant/
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── ai/
│   ├── integrations/
│   └── development/
│
├── docker/
│
├── scripts/
│
├── .env.example
├── docker-compose.yml
├── package.json
├── turbo.json
└── README.md
```

---

# 30. Monorepo

NexaHome menggunakan monorepo agar seluruh komponen dapat dikembangkan dalam satu repository.

Recommended:

```text
pnpm
Turborepo
```

Struktur:

```text
apps/
packages/
integrations/
```

Shared package seperti:

```text
@NexaHome/types
@NexaHome/ui
@NexaHome/device-core
@NexaHome/ai
```

dapat digunakan oleh berbagai aplikasi.

---

# 31. Environment

Contoh:

```env
DATABASE_URL=
JWT_SECRET=

AI_PROVIDER=
AI_API_KEY=
AI_MODEL=

MQTT_URL=
MQTT_USERNAME=
MQTT_PASSWORD=

WIZ_DISCOVERY_ENABLED=true
```

Semua secret hanya disimpan pada server.

Repository hanya menyediakan:

```text
.env.example
```

---

# 32. Development Environment

Development stack:

```text
Node.js
pnpm
Turborepo
Docker
PostgreSQL
MQTT Broker
```

Optional:

```text
Redis
```

Redis dapat digunakan kemudian untuk:

- caching
- queues
- temporary state
- event processing

Tidak wajib untuk MVP.

---

# 33. Deployment

Target awal:

```text
Windows / Linux / macOS
        ↓
Docker Compose
        ↓
NexaHome
```

Komponen:

```text
NexaHome Web
NexaHome API
PostgreSQL
MQTT Broker
```

AI tetap menggunakan API provider.

Dengan demikian pengguna tidak perlu menjalankan LLM lokal.

---

# 34. Local Network

Untuk penggunaan rumah:

```text
                    HOME NETWORK

             ┌───────────────────┐
             │     NexaHome      │
             │      Server       │
             └─────────┬─────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
         WiZ          MQTT         ESP32
          │            │            │
       Bulb         Sensors       Devices
```

Dashboard dapat diakses melalui browser dalam jaringan lokal.

---

# 35. Remote Access

Remote access dibuat sebagai fitur terpisah.

Arsitektur:

```text
Internet
   ↓
Secure Gateway
   ↓
NexaHome Server
   ↓
Home Network
```

Remote access **tidak boleh membuka port internal perangkat secara langsung**.

Pilihan implementasi nantinya dapat menggunakan:

- Reverse proxy
- VPN
- Secure tunnel

---

# 36. Logging

Semua aktivitas penting dicatat.

Contoh:

```text
[INFO]
Device turned on

[INFO]
Nexa executed tool

[WARN]
Device unreachable

[ERROR]
Integration connection failed
```

Activity log dapat ditampilkan di dashboard.

Contoh:

```text
19:01 Nexa turned on Living Room Light
19:05 Motion detected
19:06 Scene "Relax" activated
```

---

# 37. Error Handling

Jika perangkat tidak tersedia:

```text
User
 ↓
"Nexa, nyalakan lampu."
 ↓
AI
 ↓
Tool
 ↓
WiZ
 ↓
Connection Failed
 ↓
NexaHome Error Handler
 ↓
Nexa
 ↓
"Maaf, lampu ruang tamu tidak dapat diakses."
```

AI tidak boleh mengatakan perangkat berhasil dikontrol jika backend melaporkan kegagalan.

---

# 38. Notification System

Notification dapat berasal dari:

```text
Device
Automation
System
Nexa
Security
```

Contoh:

```text
⚠️ Lampu kamar tidak merespons.

💡 Automation "Night Mode" berhasil dijalankan.

🔌 ESP32 Kitchen offline.
```

---

# 39. Dashboard

Dashboard utama:

```text
┌───────────────────────────────────────┐
│ NexaHome                         👤   │
├───────────────────────────────────────┤
│                                       │
│ Good Evening                          │
│                                       │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│ │ 5       │ │ 3       │ │ 2       │ │
│ │ Devices │ │ Active  │ │ Offline │ │
│ └─────────┘ └─────────┘ └─────────┘ │
│                                       │
│ Rooms                                 │
│                                       │
│ [Living Room] [Bedroom] [Kitchen]     │
│                                       │
│ Recent Activity                       │
│                                       │
└───────────────────────────────────────┘
```

---

# 40. Nexa UI

Visual Mode dapat memiliki:

```text
        ┌─────────────────┐
        │                 │
        │      NEXA       │
        │      🤖         │
        │                 │
        │    Listening    │
        │                 │
        │  "I'm listening"│
        │                 │
        └─────────────────┘
```

Visual engine harus dipisahkan dari AI Core agar desain robot dapat diganti tanpa mengubah backend.

---

# 41. Nexa AI Response Contract

AI dapat mengembalikan format internal:

```json
{
  "message": "Lampu ruang tamu sudah dinyalakan.",
  "state": "HAPPY",
  "tool": {
    "name": "turn_on_device",
    "success": true
  }
}
```

Frontend kemudian menerjemahkan:

```text
state = HAPPY
      ↓
Happy Animation
      ↓
Text-to-Speech
      ↓
"Berhasil, lampu ruang tamu sudah dinyalakan."
```

---

# 42. MVP

Versi pertama jangan langsung membuat semuanya.

### MVP wajib:

```text
✓ Authentication
✓ Dashboard
✓ Rooms
✓ Devices
✓ WiZ Integration
✓ Device Control
✓ Nexa AI API
✓ Voice Command
✓ Tool Calling
✓ Nexa Visual Mode sederhana
✓ Activity Log
```

Belum perlu:

```text
✗ Complex automation builder
✗ Energy analytics
✗ Plugin marketplace
✗ Advanced memory
✗ Multi-home
✗ Mobile native app
```

---

# 43. Roadmap

## Phase 1 — Foundation

```text
Project setup
Monorepo
Database
Authentication
API
Dashboard
```

## Phase 2 — Smart Home

```text
Device Core
Room
WiZ Integration
Device control
WebSocket
```

## Phase 3 — Nexa

```text
AI API
Tool calling
Voice input
Speech-to-text
Text-to-speech
```

## Phase 4 — Visual Nexa

```text
Robot UI
AI states
Animations
Voice feedback
```

## Phase 5 — Automation

```text
Scenes
Scheduler
Triggers
Conditions
Actions
```

## Phase 6 — IoT

```text
MQTT
ESP32
Sensors
Custom devices
```

## Phase 7 — Advanced

```text
Energy monitoring
Notifications
Remote access
Multi-home
Plugin system
```

## Phase 8 — v1.0

```text
Stable API
Documentation
Security hardening
Integration SDK
Community contribution
```

---

# 44. Prinsip Penting

NexaHome **bukan AI yang mengontrol rumah secara langsung**.

Struktur tanggung jawabnya:

```text
Nexa AI
   │
   │ "Apa yang diminta user?"
   ↓
Tool Calling
   │
   ↓
NexaHome Core
   │
   │ "Bagaimana cara menjalankannya?"
   ↓
Integration
   │
   ↓
Device
```

Dengan pemisahan ini:

- AI dapat diganti
- Provider AI dapat diganti
- Device dapat diganti
- Integration dapat ditambah
- UI dapat diubah
- Nexa dapat memiliki beberapa interface
- Sistem lebih aman dan mudah dikembangkan

---

# 45. Final Architecture

```text
                         ┌──────────────────────┐
                         │        USER          │
                         └──────────┬───────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
               Visual UI                       Voice Input
                    │                               │
                    │                        Speech-to-Text
                    │                               │
                    └───────────────┬───────────────┘
                                    │
                              NEXA AI CORE
                                    │
                              AI API Provider
                                    │
                              Tool Calling
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
               AI Response                    AI Tool Call
                    │                               │
                    ↓                               ↓
             Visual State                    NEXAHOME CORE
                    │                               │
              Robot UI                    ┌────────┴────────┐
                                          │                 │
                                    Automation        Device Core
                                          │                 │
                                          └────────┬────────┘
                                                   │
                                          Integration Layer
                                                   │
                              ┌────────────────────┼────────────────────┐
                              │                    │                    │
                             WiZ                  MQTT                 ESP32
                              │                    │                    │
                           Devices              Sensors              Devices
```

---

# 46. Kesimpulan

NexaHome dibangun sebagai **smart home platform**, sedangkan Nexa merupakan **AI assistant layer** di atas platform tersebut.

Nexa menggunakan **AI API yang sudah tersedia**, dengan fokus utama pada voice command dan tool calling.

Arsitektur ini membuat NexaHome tetap modular:

```text
Smart Home Core
       +
Nexa AI
       +
Device Integrations
       +
Visual Interface
       =
NexaHome
```

Tujuan akhirnya adalah membuat platform smart home open-source yang dapat digunakan pada rumah sendiri, dikembangkan oleh komunitas, dan diperluas ke berbagai jenis perangkat serta interface di masa depan.