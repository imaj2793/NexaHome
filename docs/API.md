# NexaHome — Referensi API

Base URL: `http://localhost:3001/api` · Semua endpoint (kecuali `register`/`login`/`health`) butuh header `Authorization: Bearer <token>`.

> `?homeId=...` = filter opsional berdasarkan home milik user.

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
| DELETE | `/homes/:id` | hapus |

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
| GET | `/integrations?homeId=` | daftar |
| POST | `/integrations` | buat |
| POST | `/integrations/:id/discover` | scan perangkat (mock untuk dev) |

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

Event `nexa.state` → `{ homeId, state, message? }` (state robot 8 ekspresi).
Event `device:state` → update state perangkat real-time.

**State Nexa:** `IDLE · LISTENING · THINKING · PROCESSING · SUCCESS · ERROR · READY · SLEEPING`

---

## Tool Nexa (dipanggil LLM)

`get_devices` · `get_device_status` · `turn_on_device` · `turn_off_device` · `set_brightness` · `set_color` · `set_temperature` · `get_room_status` · `activate_scene` · `create_automation` · `get_energy_usage`
