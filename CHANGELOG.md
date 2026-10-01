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

### Fixed

- **Kredensial integrasi yang kosong membuat broker menolak dengan `not authorised`.**
  `MqttAdapter.resolveTarget()` membandingkan kredensial integrasi dengan kredensial
  global apa adanya, sehingga integrasi yang tidak menyimpan `brokerUrl`/`username`
  sendiri dianggap "broker lain" lalu dibuka lewat koneksi sekali pakai **tanpa**
  username. Di listener plaintext anonymous ini lolos diam-diam; setelah listener
  8883/443 dibuat ber-password, setiap `POST /integrations/:id/discover` gagal dan
  `POST /devices/:id/commands` tidak pernah sampai ke broker. Sekarang kredensial
  yang tidak diisi berarti "pakai yang global" — sesuai komentar yang sudah ada di
  kode — dan koneksi tetap ke primary. Test regresi:
  `kredensial kosong berarti pakai kredensial global, bukan tanpa kredensial`.

- **Scan jaringan memakai kredensial global, bukan kredensial integrasi.**
  `IntegrationManager.discoverAll()` memanggil `discoverDevices()` tanpa
  argumen, jadi `POST /discovery/scan` tidak pernah melihat perangkat yang
  mengumuman ke broker kedua — padahal `POST /integrations/:id/discover` sudah
  meneruskannya dengan benar. Sekarang `discoverAll` menerima resolver kredensial
  per tipe, dan `scanNetwork(userId)` memasok kredensial integrasi milik user
  yang bisa diakses. Kredensial yang tidak terbaca membuat integrasi dilewati,
  bukan diganti kredensial global yang bisa menampilkan perangkat milik orang
  lain.
- **`INTEGRATION_CREDENTIALS_INVALID` hilang di respons.** Jalur perintah
  melempar `BadRequestException` biasa, yang dipetakan filter global menjadi
  `VALIDATION_FAILED`, jadi klien tidak pernah tahu itu masalah kredensial.
  Sekarang dilempar sebagai `ApiError` dan kode survives sampai klien. Pesannya
  juga menyebut `INTEGRATION_CREDENTIALS_KEY`, sama seperti yang dilakukan
  `IntegrationsService.readCredentials`.
- **Perangkat bisa diarahkan ke ruangan milik rumah lain.** `DevicesService.update`
  menulis `roomId` tanpa memverifikasi rumah asal ruangan, dan respons device
  menyertakan `room` — jadi nama ruangan milik orang lain ikut terbaca. `create`
  punya masalah yang sama. Sekarang keduanya menolak ruangan dari rumah lain
  dengan 404.
- **Tombol mikrofon Nexa berhenti berfungsi.** Saat panel Nexa ditulis ulang,
  `onClick` tombol rekam hilang sehingga perintah suara tidak bisa dipakai sama
  sekali. Sekarang tertangkap test
  (`tetap bisa mengirim pesan teks saat voice gagal`).
- **Scan tidak lagi memalsukan perangkat.** Adapter MQTT dan Tasmota dalam mode
  `mock` kini mengembalikan array kosong. Sebelumnya scan menampilkan
  "WiZ Bulb Ruang Tamu", "Tasmota Relay", dan sensor fiktif yang tidak ada di
  jaringan mana pun. Mode `mock` berarti "tidak ada koneksi", bukan simulator.
- **AI tidak lagi memakai ID perangkat hardcode.** `MockAIProvider` mengembalikan
  `device_living_light`/`device_bedroom_light` yang tidak ada di database, sehingga
  setiap perintah ke perangkat gagal dengan "Perangkat tidak ditemukan".
  Sekarang `NexaService` mengirim katalog perangkat milik user ke provider
  (`AIProvider.chat({ devices })`), dan provider AI OpenAI-compatible
  menyisipkannya ke system prompt agar model memakai `device_id` yang benar.
- **Perintah tidak terkirim berulang.** Mock provider mengulang tool call yang
  sama pada setiap iterasi loop, sehingga satu perintah "nyalakan lampu" dikirim
  ke broker 4 kali. Sekarang provider berhenti dan menjawab final begitu hasil
  tool masuk.
- **Kegagalan tool Nexa dapat didiagnosis.** Error dari tool dicatat di log
  (`NexaToolsService`) dan alasan sebenarnya ditampilkan ke user, bukan pesan
  generik "Maaf, perintah belum selesai diproses."

### Removed

- **Kontrol mati dihapus dari halaman login.** "Ingat saya" tidak pernah dipakai
  dan "lupa password" tidak punya endpoint, jadi keduanya dihapus sebagai ganti
  menampilkan tombol yang tidak melakukan apa pun.
- **Kolom `HomeMember.role` dihapus** (default `USER`, enum `ADMIN|OWNER|USER`)
  lewat migrasi `20260930160920_drop_home_member_role`. Kolom itu tidak pernah
  dibaca kode — `ADMIN` dan `USER` selalu berperilaku sama sehingga hanya
  menyesatkan. Enum `Role` tetap dipakai `User.role`.
- `docs/API.md` mengklaim `POST /homes/:id/members` menerima `role: USER|ADMIN`.
  Field itu tidak pernah ada dan sudah dibuang oleh whitelist DTO.
- **Integrasi WiZ dihapus** (`@nexahome/integration-wiz`, enum `IntegrationType.WIZ`).
  Protokol UDP port 38899 hanya berfungsi bila API berjalan langsung di jaringan
  lokal: dari dalam container, broadcast keluar tetapi balasan unicast dari lampu
  tidak sampai (NAT), sehingga scan selalu kosong dan tidak bisa diverifikasi
  dengan perangkat nyata. Menghapus integrasi ini lebih jujur daripada
  menampilkan data simulasi. Migrasi `20260929210000_remove_wiz_integration`
  membersihkan integrasi, perangkat, scene/automation action terkait, dan nilai
  enum (PostgreSQL tidak mendukung `DROP VALUE`, jadi tipe dibuat ulang).
- **Data perangkat dummy dari seed.** `pnpm db:seed` kini hanya membuat akun
  owner, home, 3 ruangan, dan integrasi MQTT/Tasmota. Data demo dipindahkan ke
  `pnpm db:seed:demo` (opsional) dan diberi label "(Demo)".


### Added

- **Listener broker MQTT memakai TLS dan password.**
  Compose punya tiga listener dengan batas jelas: `mqtt://` di 1883 (hanya
  loopback host dan jaringan internal compose), `mqtts://` di 8883, dan `wss://`
  yang dipublish sebagai 443 di host. Dua listener terakhir mewajibkan
  password; CA dan private key tidak pernah masuk container API, dan private key
  CA tidak di-mount ke broker.
  `./scripts/mqtt-tls.sh` membuat CA lokal terpisah dari sertifikat server
  (sertifikat self-signed tidak bisa menjadi trust anchor dirinya sendiri, jadi
  perangkat akan menolaknya), lalu menerbitkan sertifikat dengan SAN `localhost`, `mosquitto`,
  `mqtt`, `nexahome`, dan hostname host, membangkitkan password, lalu menuliskannya
  ke `.env`. WebSocket plaintext di 9001 dihapus.
  `MqttAdapter` menerima `tlsRejectUnauthorized`/`tlsCa`/`tlsCert`/`tlsKey` dan
  meneruskannya ke koneksi utama maupun sekali pakai, hanya pada skema URL
  terenkripsi; `rejectUnauthorized=false` pada `mqtt://` ditolak saat start.
  API membaca CA dari `MQTT_TLS_CA_PATH` (mqtt.js menerima isi PEM, bukan nama
  file) dan memverifikasi sertifikat broker sungguhan. 14 test baru di
  `apps/api/test/mqtt-tls.spec.ts` dan `mqtt-tls-env.spec.ts`.

- **E2E keamanan dijalankan terhadap API sungguhan** (`apps/api/test/security.e2e-spec.ts`,
  19 test) lewat socket.io-client dan supertest, menggantikan verifikasi manual
  via curl. Cakupannya: handshake WebSocket tanpa token, token rusak, token milik
  user yang sudah dihapus, dan token via query string; isolasi antar-home di
  WebSocket termasuk event perangkat rumah lain yang tidak boleh sampai; isolasi
  HTTP antar tenant; serta kredensial integrasi yang tidak pernah kembali apa
  adanya.
- `credential-reader.service.spec.ts` (9 test) mengunci dua perilaku
  `CredentialReader`: kode error yang bertahan ke klien dan `tryRead` yang
  tidak melempar error.
- Scan jaringan punya test sendiri di `discovery.service.spec.ts`: resolver
  kredensial benar-benar diteruskan ke adapter, hanya integrasi rumah yang bisa
  diakses yang diambil, envelope rusak jadi `undefined`, dan integrasi dobel
  memakai yang paling lama.
- `apps/api/test/adapter-credentials.spec.ts` (14 test) mengunci enkripsi,
  dekripsi, dan penerusan kredensial ke adapter.
- `test/setup.ts` menyediakan `INTEGRATION_CREDENTIALS_KEY` dummy agar env test
  tidak bergantung pada `.env` lokal yang di-gitignore.
- Timeout yang sebelumnya tidak ada kini eksplisit di adapter MQTT: publish 5
  detik (`PUBLISH_TIMEOUT_MS`) dan pembacaan state 3 detik
  (`STATE_READ_TIMEOUT_MS`) — mqtt v5 tidak punya opsi timeout, sehingga TCP yang
  menggantung akan menahan request HTTP tanpa batas.
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
  (`MQTT_MODE=mock|mqtt`, `TASMOTA_MODE=mock|http`).
- **Ketahanan integrasi**: kegagalan connect adapter tidak lagi menggagalkan boot
  API; error dicatat lewat logger dan integrasi lain tetap berfungsi.
- **CI/CD**: workflow `ci.yml` (lint, typecheck, test, build, audit, build image
  Docker), workflow `release.yml` (build & push GHCR + GitHub Release dari tag),
  serta `.github/dependabot.yml` (pnpm + github-actions, mingguan, dikelompokkan).
- **Env**: validasi `JWT_SECRET`/`DATABASE_URL`/`CORS_ORIGIN` untuk produksi, dan
  `API_PORT` diparse sebagai number.

### Changed

- **Kredensial integrasi kini benar-benar dipakai, bukan hanya disimpan.**
  Sebelumnya envelope hanya didekripsi saat dibaca lewat API, sementara perintah
  ke perangkat tetap memakai kredensial global dari environment. Sekarang
  `DeviceCoreService` meneruskannya ke adapter sebagai `AdapterCredentials`:
  - MQTT memakai koneksi utama yang sudah dijaga adapter bila broker integrasi
    sama dengan broker utama, dan koneksi sekali pakai bila berbeda. Kredensial
    dibaca di `executeCommand`, `getDeviceState`, dan `discoverDevices`.
  - Broker kedua punya batas yang kini terdokumentasi: publish tidak
    meng-update cache state, `getDeviceState` membaca satu state sekali pakai,
    dan discovery hanya mendengarkan pengumuman selama `discoveryWindowMs`.
  - Scan ke broker kedua tidak memakai cache broker utama sebagai cadangan,
    karena perangkat di sana milik integrasi lain.
  - Tasmota memakai HTTP Basic dari `username`/`password` kredensial integrasi.
  - Kunci yang salah atau envelope rusak membatalkan perintah dengan
    `INTEGRATION_CREDENTIALS_INVALID`, bukan melanjutkan tanpa kredensial yang
    akan mengirim perintah ke broker/perangkat global.
  - `toAdapterError` meneruskan `ApiError`/`HttpException` tanpa menerjemahkan
    ulang.
  - Vitest meng-inline adapter ke source-nya; tanpa itu test menguji `dist` CJS
    yang basi dan `vi.mock` tidak meng-intercept mqtt.
- **Method yang namanya "Owned" sekarang jujur soal filter yang dipakai.**
  `assertHomeOwned`, `assertRoomOwned`, `assertSceneOwned`,
  `assertAutomationOwned`, dan `assertDeviceOwned` semuanya memakai
  `accessibleHomeFilter` — artinya anggota rumah boleh, bukan hanya pemilik.
  Diganti jadi `*Accessible` supaya nama tidak menjanjikan akses yang tidak
  ada. `homes.service.ensureOwned` dan `integrations.service.assertHomeOwned`
  dibiarkan: keduanya benar-benar memakai `ownerId`.
- Kredensial integrasi dibaca lewat `CredentialReader` yang bisa di-inject,
  dipakai bersama oleh DeviceCore, Discovery, dan Integrations, dengan dua
  perilaku: `read()` melempar error untuk perintah satu-perangkat, `tryRead()`
  mengembalikan `undefined` untuk scan gabungan yang tidak boleh gagal utuh.
- Komentar `home-access.ts` diperbarui: ia masih menyatakan anggota rumah
  "tidak bisa melihat apa pun", padahal sudah sebaliknya sejak anggota rumah
  mendapat kontrol penuh.
- **Anggota rumah mendapat kontrol penuh atas isi rumah** — create, update, dan
  delete device serta room, plus kirim command. Lingkup yang tetap milik pemilik
  saja: ubah/hapus rumah, tambah/keluarkan anggota, dan seluruh operasi
  integrasi termasuk kredensial. Penolakan kini memakai 404, bukan 403, supaya
  keberadaan sumber daya tidak terkonfirmasi.
- API dikonfigurasi ulang untuk ESM (`"type": "module"`), kompatibel dengan
  NestJS 12.
- Web memakai Next.js 15 + React 19 dengan output standalone untuk image Docker.
- `CORS_ORIGIN` `localhost` di produksi kini hanya memberi peringatan, bukan error,
  agar self-hosted di localhost tetap mungkin; `JWT_SECRET` yang lemah tetap ditolak.
- Override keamanan dipindahkan ke `pnpm-workspace.yaml`
  (`postcss ^8.5.23`, `deepmerge-ts ^8.0.0`) karena pnpm 12 mengabaikan
  `pnpm.overrides` di `package.json`.
- **UI web dirombak menjadi light-first.** Tampilan gelap-neon berbasis emoji dan
  class hardcode diganti permukaan terang dengan satu aksen teal. Design token
  (warna, radius, bayangan, tipografi) kini didefinisikan sekali di
  `apps/web/app/globals.css` lewat `@theme`, jadi mengubah identitas warna cukup
  mengedit satu blok.
- **Dashboard memakai app shell sidebar** dengan enam section (Ringkasan, Ruang,
  Adegan, Otomasi, Aktivitas, Integrasi). Berpindah section hanya mengubah state
  — tidak ada route per bagian dan tidak ada reload data.
- **Primitive UI lokal** ditambahkan di `apps/web/components/ui/` (button, card,
  input, label, dialog, switch, badge, separator) di atas Radix UI + CVA, bukan
  framework monolit.
- **Device card** memakai ikon lucide-react lewat `apps/web/lib/devices.ts`
  sebagai sumber kebenaran untuk ikon, label tipe, dan status, menggantikan emoji
  per komponen.
- **Modal tambah perangkat** memakai primitive Dialog sehingga fokus terkunci,
  tombol Escape, dan scroll body ikut benar tanpa logika sendiri.
- **Riwayat aktivitas** berubah dari modal menjadi section tersendiri.
- `nexa-background.tsx` (partikel neon) dihapus karena tidak lagi terpakai.

### Security

- `pnpm audit --prod` bersih (0 advisory).
- Integrasi yang gagal connect (mis. broker MQTT mati) tidak lagi memblokir startup API.

## [0.1.0]

### Added

- Rilis awal NexaHome: homes/rooms/devices, automation & scenes, energy monitoring,
  activity log, Nexa AI (mode mock), MQTT/Tasmota/WiZ adapter, Prisma + PostgreSQL,
  Next.js dashboard.
