# Integrasi NexaHome

Hanya dua adapter yang benar-benar ada: **MQTT** dan **Tasmota**.
Dokumen ini tidak memuat integrasi yang belum ditulis.

## 1. Kontrak adapter

Semua vendor harus memenuhi `IntegrationAdapter` di
`packages/device-core/src/integration.ts`:

| Method | Tanggung jawab |
| --- | --- |
| `scan()` | temukan perangkat di jaringan → `DiscoveredDevice[]` |
| `connect(device)` | simpan perangkat ke registry |
| `executeCommand(device, command)` | kirim `IntegrationCommand` ke perangkat |
| `getDeviceState(device)` | baca state terakhir |
| `disconnect()` | lepas koneksi (broker/session) |

`IntegrationManager` yang memegang daftar adapter, bukan kode per-vendor. Command
Engine tidak pernah memanggil vendor secara langsung.

## 2. MQTT

Broker lokal (Mosquitto) lewat compose. Adapter ini yang menjadi jalur utama
untuk Tasmota, ESPHome, Shelly, dan apa pun yang bisa publish ke broker.

### Topik

| Topik | Arah | Isi |
| --- | --- | --- |
| `nexahome/discovery` | perangkat → NexaHome | JSON announce, `retained` |
| `nexahome/devices/<id>/state` | perangkat → NexaHome | JSON state, `retained` |
| `nexahome/devices/<id>/set` | NexaHome → perangkat | JSON perintah |

Subscribe: `nexahome/devices/+/state` dan `nexahome/discovery`.
Pesan harus JSON valid dengan field yang dikenal (`id`, `name`, `type`,
`capabilities`, `state`, ...); payload rusak diabaikan dan di-log, tidak
dihentikan.

### TTL / basi

State dan announce `retained` yang tidak di-refresh akan **dibuang** setelah
`MQTT_DISCOVERY_TTL_MS` (default `120000` = 2 menit). Ini batas yang disengaja:
broker yang menyala dan perangkat yang sudah mati tidak boleh membuat
dashboard menampilkan perangkat palsu. Device DB tidak ikut terhapus —
hanya cache `discovered` dan `lastSeen` di memori.

### Kredensial broker

`MQTT_USERNAME` dan `MQTT_PASSWORD` diteruskan ke `mqtt.connect()`.
`MQTT_MODE` (`auto|mqtt|mock`, default `auto`) memanggil `scan()` dari adapter
yang aktif; `mock` mengembalikan `[]` — bukan perangkat contoh. Tidak ada lagi
entri discovery palsu dari mode mock.

## 3. Tasmota

Adapter Tasmota memanggil HTTP API Tasmota langsung ke IP perangkat
(`/cm?cmnd=...`), **tidak** lewat broker, dan tidak melakukan scan jaringan —
Tasmota tidak melakukan self-discovery; perangkatnya harus dicatat manual.

| Capability | Perintah Tasmota |
| --- | --- |
| `power` | `POWER1` ON/OFF |
| `brightness` | `Dimmer <0-100>` |
| `color_temperature` | `CT <kelvin>` |
| `color` | `Color <R,G,B>` |
| `temperature` (AC) | `Setpoint <°C>` |
| `fan_speed` (AC) | `FanSpeed <mode>` |
| `swing` (AC) | `SwingMode <mode>` |

AC Tasmota memakai pin GPIO kontrol, bukan IR. Detail ini tidak di-hardcode di
NexaHome; `capabilities` perangkat diisi saat dibuat.

Discovery Tasmota butuh IP perangkat. Alurnya: jalankan Tasmota dengan
hostname tetap (`tasmota-lampu`) atau daftarkan manual lewat
`POST /integrations/:id/connect`. Command `Scan` di UI hanya berguna untuk
adapter yang bisa menemukan perangkat sendiri (MQTT), bukan Tasmota.

## 4. Status integrasi lain

`IntegrationType` masih memuat `ESP32`, `HOME_ASSISTANT`, dan `SHELLY` karena
nilainya sudah ada di enum Prisma. **Ketiganya tidak punya adapter.** Kalau
dipilih lewat `POST /integrations`, integrasi tersimpan, tapi setiap perintah
gagal dengan `INTEGRATION_NOT_AVAILABLE`. Itu status sebenarnya, bukan placeholder
yang menunggu magically works sendiri.

WiZ dihapus dari enum dan kode pada commit `23d200d`. Alasannya di
[ROADMAP](ROADMAP.md).

## 5. Kredensial integration

Config integrasi (token, username, password broker/API) **dienkripsi saat
disimpan** dan tidak pernah dikembalikan apa adanya:

| Lapis | Isi |
| --- | --- |
| Database | envelope AES-256-GCM: `v, alg, iv, tag, data, keys` |
| Respons `GET /integrations` | semua nilai → `••••••` |
| Kolom respons | `credentialsEncrypted: boolean` |

`INTEGRATION_CREDENTIALS_KEY` (hex 32 byte) wajib ada; `validateEnv` menolak
startup tanpa itu. Integrasi lama yang config-nya plaintext masih bisa dibaca
server (ditandai `credentialsEncrypted: false`) dan diam-diam terenkripsi
saat disimpan ulang lewat `PATCH /integrations/:id`.

Operasi `POST /integrations` (membuat integrasi) dan `PATCH /integrations/:id`
hanya untuk pemilik rumah. Baca data integrasi boleh dilakukan anggota rumah
dalam bentuk tersamarkan.

### 5.1 Kredensial dipakai adapter, bukan hanya disimpan

Envelope yang tersimpan didekripsi di server dan diteruskan ke adapter sebagai
`AdapterCredentials` (`Record<string, unknown>` yang bebas). Adapter mencari
kunci yang memang miliknya:

| Tipe | Kunci yang dibaca | Dipakai untuk |
| --- | --- | --- |
| MQTT | `url` atau `brokerUrl`, `username`, `password` | broker tujuan |
| Tasmota | `username`, `password` | HTTP Basic |

Kalau kredensial yang dibaca integrasi tidak sama dengan `MQTT_BROKER_URL` /
`MQTT_USERNAME` di env, adapter memakai koneksi sekali pakai ke broker
integrasi tersebut lalu menutupnya. Konsekuensinya:

- `executeCommand` ke broker kedua hanya mengembalikan state optimistis dari
  cache broker utama — broker kedua tidak punya listener state milik adapter.
- `getDeviceState` ke broker kedua membaca satu state lewat koneksi sekali
  pakainya sendiri, dengan batas waktu 3 detik.
- `discoverDevices` ke broker kedua mendengarkan pengumuman selama
  `discoveryWindowMs` (default 3 detik). Broker hanya mengumuman saat
  perangkat menyala, jadi hasil scan bisa kosong walaupun perangkat ada.

Perilaku ini diuji di `apps/api/test/adapter-credentials.spec.ts`.

Kunci yang salah atau envelope rusak **membatalkan** perintah dengan
`INTEGRATION_CREDENTIALS_INVALID` (HTTP 400). Sengaja tidak dilanjutkan tanpa
kredensial: perintah tanpa kredensial akan terkirim ke broker/perangkat global,
yaitu perangkat yang berbeda dari yang diminta pengguna.

## 6. Menambah integrasi baru

Checklist, urutan yang tidak bisa dilompati:

1. Tambah nilai enum di `schema.prisma` **dan** union `IntegrationType` di
   `packages/device-core/src/integration.ts` (keduanya wajib; tidak ada migrasi
   otomatis).
2. Buat package `packages/integration-<vendor>/` dengan 5 method adapter.
3. Daftarkan adapter di `device-core.module.ts` pada `IntegrationManager`.
4. Test dengan perangkat nyata. Kalau tidak ada perangkat nyata, tulis di sini
   bahwa statusnya belum diverifikasi.
5. Isi capability list yang benar-benar didukung perangkat itu.
