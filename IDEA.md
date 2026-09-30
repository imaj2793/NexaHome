# NexaHome

> **Your Home. Connected. Intelligent.**

NexaHome adalah **open-source smart home platform** yang dirancang untuk menghubungkan, mengontrol, dan mengotomatisasi berbagai perangkat rumah dalam satu sistem.

NexaHome menggunakan **Nexa AI** sebagai asisten berbasis suara yang memanfaatkan **AI API dari model yang sudah tersedia**, sehingga tidak perlu melakukan training LLM sendiri.

> **Status (Sep 2026):** Ini dokumen **ide/visi**, bukan daftar fitur yang ada.
> Untuk apa yang benar-benar terpasang, baca dokumen di `docs/`, terutama
> bagian "Yang sengaja tidak ada" di
> [`docs/architecture.md`](docs/architecture.md). Yang tidak ada di kode hari ini:
> **WiZ** (dihapus pada commit `23d200d`), SSDP, BLE, Google Home, Tuya,
> SmartThings, dan infrared.

---

## 🎯 Tujuan

NexaHome dibuat untuk menyediakan smart home system yang:

- Mudah digunakan
- Modular dan mudah dikembangkan
- Mendukung berbagai perangkat dan protokol
- Dapat digunakan secara lokal
- Memiliki voice assistant
- Open-source dan dapat dikembangkan komunitas

---

# 🤖 Nexa AI

**Nexa** adalah AI assistant milik NexaHome.

Nexa tidak dibuat dengan melatih LLM dari awal. Nexa menggunakan **API model AI yang sudah tersedia** untuk memahami perintah pengguna.

Fokus utama Nexa adalah:

- Voice command
- Natural language understanding
- Tool calling
- Kontrol perangkat
- Memberikan respons kepada pengguna
- Menentukan ekspresi AI pada Visual Mode

### Contoh

> "Nexa, nyalakan lampu ruang tamu."

Alurnya:

```text
Voice
  ↓
Speech-to-Text
  ↓
Nexa AI API
  ↓
Tool Calling
  ↓
NexaHome Core
  ↓
WiZ / MQTT / Device
```

AI hanya menentukan **apa yang ingin dilakukan pengguna**. Eksekusi terhadap perangkat dilakukan oleh NexaHome Core.

---

# 🎭 Dua Mode Nexa

Nexa memiliki dua mode penggunaan.

## 1. Headless Mode

Nexa berjalan tanpa tampilan visual.

Contohnya:

- Voice command
- API
- CLI
- Automation
- Integrasi perangkat lain

```text
User
 ↓
Voice
 ↓
Nexa AI
 ↓
NexaHome Core
 ↓
Device
```

## 2. Visual Mode

Nexa memiliki antarmuka visual dengan karakter/robot yang dapat menunjukkan ekspresi berdasarkan keadaan AI.

Contoh state:

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

Contohnya ketika pengguna memberikan perintah:

```text
User
 ↓
"Nexa, matikan lampu."
 ↓
LISTENING
 ↓
THINKING
 ↓
Device Control
 ↓
HAPPY
 ↓
SPEAKING
```

Visual tersebut bukan AI terpisah, tetapi merupakan **interface untuk Nexa AI**.

---

# 🏠 Smart Home

NexaHome bertindak sebagai pusat pengelolaan perangkat.

Target integrasi awal:

- **WiZ**
- **MQTT**
- **ESP32**
- **Home Assistant**
- Perangkat smart home lainnya

Fitur utama:

- Device Management
- Room Management
- Device Status
- Scene
- Automation
- Activity History
- Energy Monitoring
- Notifications

---

# 🔧 AI Tools

Nexa menggunakan **tool calling** untuk berinteraksi dengan NexaHome.

Contoh tools:

```text
get_devices()
get_device_status()
turn_on_device()
turn_off_device()
set_brightness()
set_color()
get_room_status()
activate_scene()
create_automation()
get_energy_usage()
```

Contoh:

```text
User:
"Nyalakan lampu kamar."

Nexa AI:
turn_on_device("bedroom_light")

NexaHome:
→ Mengirim perintah ke perangkat
→ Perangkat menyala
```

---

# 🧠 Arsitektur

```text
                    NEXAHOME
                       │
                ┌──────┴──────┐
                │              │
            Web UI         Nexa AI
                               │
                         AI API Provider
                               │
                        Nexa AI Core
                               │
                    ┌──────────┴──────────┐
                    │                     │
                 Tools                Visual State
                    │                     │
                    └──────────┬──────────┘
                               │
                        NexaHome Core
                               │
             ┌─────────────────┼─────────────────┐
             │                 │                 │
            WiZ              MQTT             ESP32
```

---

# 💻 Teknologi

### Frontend

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- WebSocket

### Backend

- NestJS
- TypeScript
- Prisma
- PostgreSQL

### AI

- AI API Provider
- Speech-to-Text
- Tool Calling
- Text-to-Speech

### IoT

- WiZ
- MQTT
- ESP32
- Home Assistant

---

# 📁 Struktur Project

```text
nexahome/
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── ui/
│   ├── types/
│   ├── device-core/
│   ├── automation/
│   ├── ai/
│   └── integrations/
│
├── integrations/
│   ├── wiz/
│   ├── mqtt/
│   └── home-assistant/
│
├── prisma/
├── docs/
├── scripts/
└── README.md
```

---

# 🗺️ Roadmap

### v0.1 — Foundation
- Project setup
- Dashboard
- Device management
- Room management

### v0.2 — Smart Home
- WiZ integration
- Device control
- Scenes
- Automation

### v0.3 — Nexa AI
- AI API integration
- Voice command
- Tool calling
- Text-to-Speech

### v0.4 — Visual Nexa
- Robot interface
- AI expressions
- Animation states
- Visual feedback

### v0.5 — IoT
- MQTT
- ESP32
- Sensors
- Additional integrations

### v1.0 — NexaHome
- Stable API
- Documentation
- Plugin/integration system
- Remote access
- Community contribution

---

## 📜 License

NexaHome is an open-source project and is intended to be freely developed, modified, and extended by the community.
