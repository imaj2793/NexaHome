# AI & Voice NexaHome

Bagian ini menjelaskan Nexa (asisten AI) dan jalur suara **seperti adanya**.

## 1. Jalur perintah AI

```text
Web/CLI
  → POST /nexa/chat
  → NexaService.respond()
       1. Ambil katalog perangkat milik user (owner + anggota)
       2. Kirim ke provider AI bersama riwayat percakapan
       3. Provider mengembalikan tool call
       4. NexaToolsService.runDeviceCommand(device_id, action, value)
       5. DeviceCoreService.executeCommand()  ← validasi yang sama dengan UI
```

Langkah 5 penting: AI **tidak** punya jalur privileges sendiri. Kalau AI
meminta `set_brightness` ke lampu yang tidak punya capability itu, jawabannya
`CAPABILITY_NOT_SUPPORTED`, sama seperti klik manual.

Katalog perangkat dikirim ke AI supaya model tidak pernah mengarang `device_id`.
Tool yang tersedia didefinisikan sebagai JSON Schema di
`apps/api/src/nexa/nexa-tools.ts`, dan hanya capability yang benar-benar ada
di katalog yang dicantumkan.

## 2. Provider AI

`packages/ai/src/factory.ts` memilih implementasi dari env:

| Env | Provider | Network |
| --- | --- | --- |
| `AI_PROVIDER=mock` (default) | `MockAIProvider` | tidak |
| `AI_PROVIDER=openai` | `OpenAICompatibleProvider` | ya |

Provider mock **tidak** mengarang ID perangkat. Kalau dipanggil tanpa
katalog, ia mengembalikan jawaban yang menyatakan tidak tahu device-nya — bukan
`device_living_light` seperti versi sebelumnya. Ini disengaja: data palsu di
lapis AI akan membuat debugging mustahil.

Endpoint upstream diambil dari `AI_BASE_URL` + `AI_MODEL`, default diarahkan ke
OpenAI-compatible API. Timeout dan retry ditangani di `openai-compatible.ts`.

## 3. Voice

Paket `packages/ai/src/speech.ts` mendefinisikan kontrak `SpeechProvider`
(STT + TTS) dengan implementasi yang sama: `mock` dan OpenAI-compatible.

Yang benar-benar ada:

- `SpeechProvider` interface + factory (mirip chat).
- `MockSpeechProvider` untuk development tanpa API key.
- `OpenAICompatibleSpeechProvider` yang memanggil endpoint STT/TTS.

Yang **belum**:

- Tidak ada rekaman mikrofon di web. Halaman Nexa Chat belum punya tombol
  tekan-tahan untuk bicara; input yang ada adalah teks dan upload file
  audio opsional, yang dikirim ke backend.
- Tidak ada streaming TTS ke browser; balasan chat arrive sebagai teks penuh.
- Mock speech mengembalikan teks dummy, bukan sintesis sungguhan — jangan
  dipakai untuk demo kualitas suara.

`AI_API_KEY` dibutuhkan untuk STT/TTS sungguhan. Tanpa itu, voice hanya jalan
di mock.

## 4. Batasan yang perlu diketahui

- Tidak ada riwayat percakapan yang dipersistensi ke database. Riwayat hidup di
  memori proses API dan hilang saat restart.
- Tidak ada rate limit atau kuota per user untuk panggilan AI.
- Katalog perangkat dikirim ke provider AI di luar server kita. Kalau itu
  tidak diinginkan, pakai `AI_PROVIDER=mock` atau provider yang di-host sendiri.
- `NexaService` memilih satu rumah (rumah pertama milik user) untuk event
  realtime `nexa.state`. Chat dari dashboard tidak mengirim `homeId`, jadi
  dengan beberapa rumah, event bisa masuk ke room yang berbeda dari yang
  sedang dibuka. Ini belum diperbaiki.

## 5. Yang bisa diverifikasi hari ini

```bash
# mock: tanpa network, tanpa key
AI_PROVIDER=mock pnpm --filter nexahome dev

# perintah nyata ke perangkat: AI → tool → DeviceCoreService
# (butuh MqttAdapter aktif dan perangkat Tasmota/ESPHome nyata)
```
