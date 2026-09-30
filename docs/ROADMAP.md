# NexaHome — Roadmap Distribusi v1.0

> Tahapan menuju **siap pakai & siap distribusi**. Living checklist — centang saat selesai.
>
> **Status per 30 Sep 2026:** `lint`, `typecheck`, `test`, `build` hijau.
> **453 test** lolos (API 370 + Web 83). LICENSE, CI, Dockerfile produksi,
> docker-compose full, dan dokumentasi sudah ada. Yang tersisa terutama:
> verifikasi perangkat nyata, live AI, serta deteksi reuse refresh token dan
> rate limit global.

> Catatan integrasi: **WiZ tidak ada** dan tidak akan ditambahkan tanpa
> dokumentasi resmi + perangkat nyata untuk verifikasi. Lihat
> [integrations.md](integrations.md#4-status-integrasi-lain).

---

## Definisi "Siap Distribusi"

NexaHome dianggap siap distribusi bila:

- [ ] `pnpm run typecheck && pnpm run build` hijau di mesin bersih (fresh `pnpm install`).
- [ ] Semua fitur inti punya test yang lolos otomatis di CI.
- [ ] Installer/kompose bisa menjalankan full stack (web + api + db + mqtt) dengan satu perintah.
- [ ] Voice end-to-end (`Hi Nexa, …` → STT → LLM → aksi → TTS) teruji di perangkat target.
- [ ] Ada LICENSE, CONTRIBUTING, dan dokumentasi yang konsisten.

---

## Fase A — Stabilkan codebase (build hijau + commit) — ✅ selesai

1. [x] **Fix 3 error typecheck** di modul `discovery` (sudah selesai):
   - `apps/api/src/discovery/discovery.controller.ts:21` — `ConnectDeviceDto.device` tidak cocok dengan `ConnectDeviceInput` (`capabilities?: string[]` vs `string[]`). Samakan tipe (buat `ConnectDeviceInput.device` terima capabilities optional, atau samakan DTO dengan shape `DiscoveredDevice`).
   - `apps/api/src/discovery/discovery.service.ts:79,85` — `Prisma.IntegrationType` tidak diekspor di Prisma 6.19. Ganti jadi `import { IntegrationType } from '@prisma/client'` lalu `type as IntegrationType` (atau `Prisma.$Enums.IntegrationType`).
2. [x] **Buat migration Prisma** untuk enum `IntegrationType` (nilai baru `TASMOTA`, `SHELLY` sudah di schema, belum ada migration).
3. [x] **Commit kerjaan in-flight** per-fitur (commit kecil & terpisah):
   - `feat: discovery universal mDNS/DNS-SD` (`apps/api/src/discovery/`)
   - `feat: integrasi Tasmota` (`packages/integration-tasmota/`)
   - `feat: STT lokal whisper.cpp` (`stt.service.ts`, `nexa-transcribe.dto.ts`)
   - `feat: UI onboarding perangkat` (`add-device-modal.tsx`, `device-card.tsx`)
4. [ ] **Push ke GitHub** (ingat: user yang push sendiri).
5. [x] Gate CI: `ci.yml` menjalankan lint + typecheck + test + build tiap PR.

---

## Fase B — Testing — ✅ selesai

1. [x] **API** — pasang Vitest (370 test):
   - Unit: `auth`, `devices`, `rooms`, `scenes`, `automations`, `notifications`, `energy`.
   - Unit: `nexa-tools` (setiap tool + safety layer), `nexa.service` (loop tool-calling).
   - Unit: adapters (`mqtt`, `tasmota`) memakai stub/mode mock.
   - Unit: `discovery` (mDNS hasil mock, routing vendor → integration).
2. [x] **Web** — pasang Vitest + React Testing Library (83 test):
   - `nexa-robot` (8 state → ekspresi benar), `device-card`, `add-device-modal`.
3. [~] **Smoke manual** — register → login → buat device → kirim command → cek state
   sudah diverifikasi lewat stack Docker yang berjalan; belum jadi automated E2E.
4. [x] Script `test` di root + tiap app (`turbo run test`).

---

## Fase C — Voice penuh (fitur flagship)

1. [ ] Uji **DeepSeek live** (isi `AI_API_KEY`, `AI_PROVIDER=deepseek`) — pastikan loop tool-calling multi-langkah jalan ("nyalakan lampu kamar" = get_devices → turn_on). *Menunggu API key pengguna.*
2. [ ] Pasang **whisper.cpp + model ggml** di box target (i3 Gen11/12GB). *Menunggu akses ke box target.*
3. [ ] Uji end-to-end: STT → LLM → tool → TTS, target **< 5 detik**. *Tergantung butir 1 & 2.*
4. [x] Fallback bila STT/LLM gagal (jawaban teks + state ERROR, tidak hang) —
   `GET /api/nexa/status` melaporkan mode terbatas, error chat dibalas dengan
   `degraded` tanpa membocorkan pesan provider, dan STT/TTS yang tidak siap
   membalas `503` dengan saran beralih ke input teks.

---

## Fase D — Onboarding universal (Phase 10)

1. [~] **mDNS discovery** selesai di `discovery.service.ts` (bonjour-service:
   ESPHome, Tasmota, Shelly, HomeKit) + digabung dengan `discoverAll()` adapter
   dan didedupe — ter-cover `discovery.service.spec.ts`. **SSDP/UPnP** belum
   diimplementasikan (memerlukan perangkat nyata di LAN untuk diuji).
2. [x] **Register + test integrasi Tasmota** (3 langkah: adapter → factory provider di `device-core.module.ts` → `register()` di `DeviceCoreService`) — ter-cover test `device-core.spec.ts` & `adapters.spec.ts`.
3. [~] **BLE** — ditunda (keputusan pengguna): perangkat BLE dipasangkan manual
   lewat form onboarding, bukan via discovery otomatis.
4. [x] Polish onboarding manual (form nama/tipe/IP-MAC, validasi nama, pesan
   error, pilihan ruangan) — ter-cover `add-device-modal.spec.tsx`.

---

## Fase E — Packaging & Deploy

1. [ ] **Dockerfile produksi** untuk `apps/web` (Next standalone) dan `apps/api` (Nest).
2. [ ] **docker-compose full**: web + api + postgres + mqtt (sekarang cuma DB + broker).
3. [ ] **Satu perintah install** (script atau `docker compose up -d --build`).
4. [ ] Scan ukuran image + `pnpm audit` (dependency vuln).

---

## Fase F — CI/CD & Release

1. [x] **GitHub Actions**: lint + `typecheck` + `test` + `build` di tiap PR
   (`.github/workflows/ci.yml`, plus build image Docker & `pnpm audit --prod`).
2. [x] **Semver + CHANGELOG** (commit conventional sudah ada) — `CHANGELOG.md`
   berbasis Keep a Changelog.
3. [x] **GitHub Releases** + tag otomatis — `release.yml` (tag `v*` → image GHCR +
   GitHub Release).
4. [x] Dependabot untuk update dependency (`.github/dependabot.yml`, mingguan,
   dikelompokkan per framework).

---

## Fase G — Legal & Governance

1. [x] Pilih & tambah **LICENSE** — **MIT** (permissive, selaras visi "bebas dikembangkan komunitas").
2. [x] `CONTRIBUTING.md` — cara setup, struktur, konvensi.
3. [x] `CODE_OF_CONDUCT.md` + `SECURITY.md` (cara lapor bug keamanan).
4. [x] `docs/DEPLOYMENT.md` — deployment Docker Compose, TLS, backup, troubleshooting.
5. [x] `CHANGELOG.md` + tautan dokumen di `README.md`.

---

## Fase H — Security Hardening

1. [~] Rate limiting — `RateLimitGuard` sudah terpasang di seluruh endpoint
   `/auth/*` (register, login, refresh); rate limit **global** belum.
2. [~] Refresh token / logout — refresh token dirotasi dan bisa dicabut saat
   logout; **deteksi reuse** (token lama dicabut masih dipakai) belum.
3. [x] Validasi secret produksi — `validateEnv` menolak `JWT_SECRET` default/kosong,
   dan fallback secret dihapus dari `AuthModule` & `JwtStrategy`.
4. [~] `CORS_ORIGIN` produksi — `main.ts` memakai whitelist dari env (validasi
   env mewajibkan `CORS_ORIGIN`), dan WebSocket tidak lagi meloloskan origin
   localhost tanpa whitelist. Deployment produksi belum diverifikasi.
5. [x] Audit validasi input — kontrak error kanonik §13
   (`apps/api/src/common/errors/`), validasi capability + rentang nilai di
   Command Engine, dan web client sudah membaca `error.code`/`error.message`.
6. [x] Kredensial integration dienkripsi at-rest (AES-256-GCM) dan selalu
   disamarkan di respons. `INTEGRATION_CREDENTIALS_KEY` wajib ada.
7. [x] WebSocket wajib JWT saat handshake; event dikirim per room `home:<id>`.
8. [x] Otorisasi berbasis `HomeMember` (owner + anggota) di semua resource.

---

## Fase I — Dokumentasi & Konsistensi

1. [x] Status antar dokumen seragam: **PRD**, **README**, dan **ROADMAP** kini memakai
   penanda yang sama (✅ selesai · 🚧 berjalan · 🔬 riset · ⏳ menunggu lingkungan).
2. [x] Enum `NexaState` di schema Prisma disinkronkan ke 8 state kanonik
   (migration `20260929194500_align_nexa_state_enum`; enum tidak dipakai kolom
   apa pun sehingga tidak ada data yang hilang).
3. [x] `docs/API.md` final: endpoint `discovery`, `transcribe`, plus tabel
   `GET /nexa/status` & perilaku degradation.
4. [ ] Screenshot/demo GIF untuk README (butuh aset visual, tidak bisa digenerate otomatis).

---

## Urutan Prioritas (jalur tercepat ke rilis)

1. **Fase A** (fix build → commit → push) — unlock semua sisanya.
2. **Fase G.1** (LICENSE) — blocker legal, keputusan cepat.
3. **Fase B** (test dasar) + **Fase F** (CI) — jaga kualitas saat lanjut.
4. **Fase E** (Docker) — orang bisa install.
5. **Fase C** (voice live) — flagship siap.
6. **Fase D, H, I** — penyempurnaan.

---

## Integrasi yang sengaja tidak ada

Bagian ini supaya tidak ada yang menebak-nebak kapan vendor tertentu "support".

| Integrasi | Status | Syarat supaya benar-benar dibuat |
| --- | --- | --- |
| **WiZ** | **Dihapus** (commit `23d200d`) | Dokumentasi resmi WiZ yang bisa dibaca + perangkat WiZ nyata untuk verifikasi protokol. Ditunda karena versi lama menulis endpoint UDP yang tidak bisa dipertanggungjawabkan tanpa sumber resmi. |
| Google Home | Tidak ada | Project Google Cloud, OAuth account linking, SYNC intent yang lolos review. Detail di [google-home.md](google-home.md). |
| Tuya | Tidak ada | Dokumentasi resmi Tuya IoT Platform + akun developer + device nyata. |
| SmartThings | Tidak ada | OAuth SmartThings + device nyata. |
| Infrared | Tidak ada | IR butuh perangkat pengirim infrared (blaster), bukan broker MQTT. |
| SSDP/UPnP | Belum | Perangkat yang benar-benar memancarkan SSDP di jaringan. |
| BLE | Ditunda (keputusan pengguna) | Perangkat BLE dipasangkan manual. |
| ESP32 / Home Assistant / Shelly | Enum ada, **adapter belum** | Tulis adapter-nya; lihat checklist di [integrations.md](integrations.md#6-menambah-integrasi-baru). |

Aturan yang dipakai: kalau tidak ada dokumentasi resmi **dan** perangkat nyata
untuk menguji, integrasi tidak ditulis — lebih baik tidak ada daripada ada tapi
merusak rumah orang.

---

> **Catatan:** dokumen ini bisa disinkronkan dengan tabel roadmap di `docs/PRD.md` saat tiap fase selesai.
