# NexaHome — Product Requirements Document (PRD)

> Versi: 1.0 · Status: **live (Phase 1–8 selesai)** · Pemilik: twilight

---

## 1. Ringkasan Eksekutif

NexaHome adalah **platform smart home open-source** yang menjadi satu pusat kendali untuk semua perangkat IoT di rumah — lampu pintar, sensor, AC, dan perangkat lain — dikontrol lewat **antarmuka web** maupun **perintah suara**.

Pembeda utamanya adalah **Nexa**, asisten suara yang memanfaatkan **LLM gratis (DeepSeek)** untuk memahami perintah natural-language dan mengeksekusinya lewat **tool calling**. Nexa **bukan** LLM yang dilatih sendiri — ia jembatan antara bahasa manusia dan **NexaHome Core**.

### Visi satu kalimat

> *"Cukup katakan **Hi Nexa**."*

---

## 2. Tujuan & Non-Tujuan

### Tujuan (Goals)

1. **Satu tempat kendali** untuk semua perangkat IoT, lintas protokol (WiZ, MQTT, dan seterusnya).
2. **Voice-first** — perintah suara adalah cara utama berinteraksi, diproses LLM gratis.
3. **Local-first** — STT berjalan lokal (whisper.cpp), tanpa kirim audio ke cloud.
4. **Mudah dikembangkan** — modular, kontrak integrasi jelas, dokumentasi lengkap.
5. **Open-source** — bebas dikembangkan komunitas.

### Non-Tujuan (Non-Goals)

- Bukan layanan cloud berbayar — tanpa lock-in vendor.
- Bukan pengganti penuh Home Assistant (fokus pada pengalaman suara + kontrol terpadu).
- Bukan aplikasi mobile native (web responsif dulu).

---

## 3. Pengguna & Persona

| Persona | Deskripsi | Kebutuhan |
| --- | --- | --- |
| **Pemilik rumah** | Pengguna utama, mengontrol rumah sehari-hari | Perintah suara cepat, kontrol lampu/AC, jadwal otomatis |
| **Hobbiest IoT** | Punya banyak perangkat beda protokol | Menambah perangkat mudah, integrasi fleksibel |
| **Kontributor** | Pengembang yang ikut membangun | Dokumentasi jelas, arsitektur modular, kontrak integrasi |

---

## 4. Fitur Inti

### 4.1 Device Management (universal onboarding)
- Mendaftarkan perangkat IoT ke NexaHome.
- **Target onboarding**: via **Bluetooth** dan **jaringan yang sama** (mDNS/SSDP) — universal, tidak terkunci satu platform.
- Setelah terhubung, semua kendali (nyala/mati, kecerahan, warna, suhu) dilakukan lewat NexaHome.

### 4.2 Nexa AI (voice assistant)
- Wake word **"Hi Nexa"** memulai percakapan.
- STT **lokal** (whisper.cpp) → teks → **DeepSeek** (LLM) → tool calling → eksekusi perangkat.
- Balasan dibacakan (TTS).
- 8 ekspresi robot di UI mencerminkan state AI.

### 4.3 Scenes
- Satu perintah mengatur banyak perangkat sekaligus (mis. "Movie Night" → lampu redup + lampu kamar mati).

### 4.4 Automations
- Jadwal & pemicu otomatis (mis. lampu nyala jam 07:00), dievaluasi oleh Automation Engine (scheduler).

### 4.5 Energy Monitoring
- Estimasi konsumsi daya per perangkat aktif + total watt + kWh/hari.

### 4.6 Notifications
- Notifikasi pengguna (mis. selamat datang, alert otomasi).

---

## 5. Alur Pengguna (User Journeys)

### 5.1 Kontrol suara (jalur utama)

```text
User: "Hi Nexa, nyalakan lampu kamar"
  → 🎤 rekam (push-to-talk)
  → STT lokal (whisper.cpp) → "hi nexa nyalakan lampu kamar"
  → buang wake word → "nyalakan lampu kamar"
  → DeepSeek (tool calling) → turn_on_device("device_bedroom_light")
  → NexaHome Core → WiZ/MQTT → lampu nyala
  → Nexa menjawab (teks + suara)
```

### 5.2 Onboarding perangkat (target — riset berjalan)

```text
User buka "Tambah Perangkat"
  → NexaHome scan jaringan (mDNS/SSDP) & Bluetooth
  → pilih perangkat yang ditemukan
  → konfirmasi → perangkat terdaftar → siap dikontrol
```

---

## 6. Persyaratan Non-Fungsional (NFR)

| Aspek | Persyaratan |
| --- | --- |
| **Latensi STT** | Transkripsi perintah singkat < 3 detik di CPU i3 Gen 11 / 12 GB RAM |
| **Biaya AI** | LLM gratis (DeepSeek) — tanpa biaya operasional wajib |
| **Privasi** | Audio diproses lokal; hanya teks perintah yang dikirim ke LLM |
| **Keamanan** | JWT, hashing password, header keamanan (helmet), validasi input, AI safety layer |
| **Portabilitas** | Berjalan di macOS (dev) & Linux x86 (target i3/12GB) |
| **Ekstensibilitas** | Kontrak `IntegrationAdapter` untuk menambah protokol baru |

---

## 7. Roadmap & Status

| Phase | Isi | Status |
| --- | --- | --- |
| 1 — Foundation | monorepo, auth, homes/rooms/devices, dashboard | ✅ |
| 2 — Smart Home | device core, WiZ, WebSocket | ✅ |
| 3 — Nexa AI | provider abstraction, tool calling, TTS | ✅ |
| 4 — Visual Nexa | robot UI 8 ekspresi + animasi | ✅ |
| 5 — Automation | scenes, scheduler, triggers, actions | ✅ |
| 6 — IoT | MQTT integration | ✅ |
| 7 — Advanced | notifications, energy monitoring | ✅ |
| 8 — v1.0 | dokumentasi, security hardening | ✅ |
| **9 — Voice penuh** | DeepSeek live + STT lokal + wake word | 🚧 (kode siap, tunggu API key) |
| **10 — Onboarding universal** | mDNS/SSDP + Bluetooth | 🔬 riset |

---

## 8. Metrik Keberhasilan (proposal)

- Perintah suara dieksekusi dalam < 5 detik end-to-end (STT → LLM → aksi).
- 0 biaya wajib untuk AI & STT.
- Kontributor baru bisa `pnpm install && pnpm dev` dalam < 15 menit (dibuktikan lewat docs).

---

## 9. Definisi Sukses MVP

Saat ini sudah tercapai: auth, dashboard, device control, WiZ/MQTT, Nexa AI (mock→DeepSeek), scenes, automations, energy, notifications, voice pipeline (STT lokal + wake word).
