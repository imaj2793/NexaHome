# NexaHome — Referensi API

Base URL: `http://localhost:3001/api` · Semua endpoint (kecuali `register`/`login`/`health`) butuh header `Authorization: Bearer <token>`.

> `?homeId=...` = filter opsional berdasarkan home milik user.

## Kontrak error

Semua error memakai satu bentuk, apa pun penyebabnya:

```json
{
  "success": false,
  "error": { "code": "DEVICE_OFFLINE", "message": "…", "details": { } }
}
```

`details` hanya muncul kalau ada isinya. `code` yang bisa muncul:

| Code | HTTP | Kapan |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | DTO tidak valid; `details.fields` berisi daftar field |
| `UNAUTHORIZED` | 401 | token hilang/tidak valid/kedaluwarsa |
| `FORBIDDEN` | 403 | bukan pemilik, bukan anggota, atau WS join rumah orang |
| `NOT_FOUND` | 404 | resource tidak ada **atau** bukan milik user |
| `RATE_LIMITED` | 429 | melewati batas; `details.retryAfter` berisi detik |
| `DEVICE_OFFLINE` | 503 | `state.online === false` saat perintah dikirim |
| `CAPABILITY_NOT_SUPPORTED` | 400 | perangkat tidak punya capability itu |
| `INVALID_COMMAND_VALUE` | 400 | nilai di luar rentang capability |
| `INTEGRATION_NOT_AVAILABLE` | 501 | integration tidak punya adapter yang jalan |
| `INTEGRATION_COMMAND_FAILED` | 502 | vendor/adapter menolak atau gagal |
| `INTEGRATION_CREDENTIALS_INVALID` | 400 | `INTEGRATION_CREDENTIALS_KEY` tidak bisa dipakai |
| `INTERNAL_ERROR` | 500 | kesalahan tak terduga (detailnya tidak dibocorkan) |

Kode error eksternal (Prisma/Postgres/vendor) tidak pernah muncul di `code`;
semuanya diterjemahkan ke kode di atas.

---

## Auth

| Method | Path | Body | Keterangan |
| --- | --- | --- | --- |
| POST | `/auth/register` | `{ email, password, name? }` | daftar |
| POST | `/auth/login` | `{ email, password }` | → `{ accessToken }` |
| GET | `/auth/me` | — | profil user terautentikasi |

## Homes

| Method | Path | Keterangan |
| --- | --- | --- |
| GET | `/homes` | daftar home |
| POST | `/homes` | buat home |
| GET | `/homes/:id` | detail + rooms/devices/integrations |
| PATCH | `/homes/:id` | ubah |
| DELETE | `/homes/:id` | hapus (owner) |
| GET | `/homes/:id/members` | daftar anggota rumah |
| POST | `/homes/:id/members` | tambah anggota (owner) — body `{ "email": "…", "role"?: "USER\|ADMIN" }` |
| DELETE | `/homes/:id/members/:memberId` | keluarkan anggota (owner) |

## Rooms

| Method | Path | Keterangan |
| --- | --- | --- |
| GET | `/rooms?homeId=` | daftar ruangan |
| POST | `/rooms` | buat |
| GET | `/rooms/:id` | detail + devices |
| PATCH | `/rooms/:id` | ubah |
| DELETE | `/rooms/:id` | hapus |

## Devices

| Method | Path | Keterangan |
| --- | --- | --- |
| GET | `/devices?homeId=&roomId=` | daftar perangkat |
| POST | `/devices` | buat |
| GET | `/devices/:id` | detail |
| PATCH | `/devices/:id` | ubah |
| DELETE | `/devices/:id` | hapus |
| POST | `/devices/:id/commands` | `{ action, value? }` → eksekusi perintah |

## Integrations

| Method | Path | Keterangan |
| --- | --- | --- |
| GET | `/integrations?homeId=` | daftar; `config` selalu disamarkan (`••••••`) |
| POST | `/integrations` | buat (owner); config dienkripsi AES-256-GCM |
| PATCH | `/integrations/:id` | ubah nama/status/config (owner); dipakai juga untuk mengenkripsi ulang config lama |
| POST | `/integrations/:id/discover` | scan perangkat. **Mock mengembalikan `[]`** — tidak ada perangkat palsu |
| POST | `/integrations/:id/connect` | simpan hasil scan ke registry |

`credentialsEncrypted: false` artinya config masih plaintext dari masa lalu;
server tetap membacanya, tapi setiap nilai dikembalikan tersamarkan.

## Scenes (Phase 5)

| Method | Path | Keterangan |
| --- | --- | --- |
| GET | `/scenes?homeId=` | daftar scene |
| POST | `/scenes` | buat `{ name, homeId, actions[] }` |
| GET | `/scenes/:id` | detail |
| PATCH | `/scenes/:id` | ubah |
| DELETE | `/scenes/:id` | hapus |
| POST | `/scenes/:id/activate` | jalankan semua action |

## Automations (Phase 5)

| Method | Path | Keterangan |
| --- | --- | --- |
| GET | `/automations?homeId=` | daftar |
| POST | `/automations` | buat `{ name, homeId, enabled?, triggers[], actions[] }` |
| GET | `/automations/:id` | detail |
| PATCH | `/automations/:id` | ubah |
| DELETE | `/automations/:id` | hapus |
| POST | `/automations/:id/run` | eksekusi manual |

## Notifications (Phase 7)

| Method | Path | Keterangan |
| --- | --- | --- |
| GET | `/notifications` | daftar (unread first) |
| PATCH | `/notifications/:id/read` | tandai dibaca |
| PATCH | `/notifications/read-all` | tandai semua dibaca |
| DELETE | `/notifications/:id` | hapus |

## Energy (Phase 7)

| Method | Path | Keterangan |
| --- | --- | --- |
| GET | `/energy/summary` | `{ totalWatts, activeCount, estimatedKwhPerDay, devices[] }` |

## Nexa AI

| Method | Path | Body | Keterangan |
| --- | --- | --- | --- |
| POST | `/nexa/chat` | `{ message }` | chat → `{ message, state, tool?, degraded? }` |
| GET | `/nexa/status` | — | kemampuan Nexa → `{ aiProvider, llm, tts, stt, degraded }` |
| POST | `/nexa/transcribe` | `{ audio }` (base64) | STT → `{ text }` |
| POST | `/nexa/speech` | `{ text }` | TTS → audio/mpeg |

**Mode terbatas (degradation).** Nexa tidak pernah menggantung saat ada fitur
yang belum siap:

| Situasi | Respon |
| --- | --- |
| LLM gagal / timeout | `200` dengan `state: "ERROR"`, `degraded: "llm_unavailable"`, pesan ramah; detail provider hanya di log server |
| Tool gagal dieksekusi | `state: "ERROR"`, `degraded: "tool_failed"` |
| STT belum dikonfigurasi atau whisper gagal | `503` pada `/nexa/transcribe` dengan pesan yang sarankan beralih ke input teks |
| TTS gagal | `503` pada `/nexa/speech`; client jatuh ke `speechSynthesis` browser |

`GET /nexa/status` dipakai UI untuk menampilkan mode terbatas sejak awal
(mic dinonaktifkan bila `stt.configured === false`) alih-alih menunggu error.

## Lainnya

| Method | Path | Keterangan |
| --- | --- | --- |
| GET | `/activity-log?homeId=&limit=` | riwayat aktivitas |
| GET | `/health` | `{ status, database, timestamp }` |

---

## WebSocket

`socket.io` di `http://localhost:3001`. Wajib kirim access token saat handshake,
lalu join room rumah. Setelah itu event hanya untuk rumah yang di-join.

```js
const s = io('http://localhost:3001', { auth: { token: accessToken } });
s.on('auth:ok', () => s.emit('home:join', { homeId }));
```

| Event | Arah | Isi |
| --- | --- | --- |
| `auth:ok` | server → client | `{ userId }` setelah token terverifikasi |
| `home:join` | client → server | `{ homeId }` |
| `home:joined` | server → client | `{ homeId }` setelah masuk room |
| `error:code` | server → client | `{ code: 'UNAUTHORIZED'\|'FORBIDDEN', message }` |
| `device:state` | server → client | state perangkat di rumah itu |
| `nexa.state` | server → client | `{ homeId, state, message? }` (8 ekspresi robot) |

Tanpa token atau token rusak: `error:code` dengan `UNAUTHORIZED`, lalu
koneksi ditutup. Join rumah yang bukan miliknya: `error:code` dengan
`FORBIDDEN`. Tidak ada broadcast ke semua client.

**State Nexa:** `IDLE · LISTENING · THINKING · PROCESSING · SUCCESS · ERROR · READY · SLEEPING`

---

## Tool Nexa (dipanggil LLM)

`get_devices` · `get_device_status` · `turn_on_device` · `turn_off_device` · `set_brightness` · `set_color` · `set_temperature` · `get_room_status` · `activate_scene` · `create_automation` · `get_energy_usage`
