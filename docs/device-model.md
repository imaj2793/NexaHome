# Model Perangkat NexaHome

Bagian ini menjelaskan model data dan batasannya apa adanya.

## 1. Dua lapis: database vs kontrak shared

Ada dua definisi "tipe perangkat" yang tidak sama, dan itu penting diketahui:

| Lokasi | Isi | Dipakai oleh |
| --- | --- | --- |
| `apps/api/prisma/schema.prisma` → `Device.type` | `String` (bebas) | kolom DB |
| `packages/types/src/device.ts` → `DeviceTypeSchema` | enum Zod | validasi web + serialisasi |

Kolom database **tidak** ditegakkan. Nilai seperti `air_conditioner` bisa tersimpan
di DB tanpa error, tapi akan ditolak Zod saat dibaca web. Spec §4 ingin daftar
`light/air_conditioner/fan/tv/switch/plug/sensor/unknown`; yang ada sekarang
`light, switch, sensor, climate, media, lock, camera, other`. Menyamakan keduanya
perlu migration + penyesuaian nilai yang sudah tersimpan.

## 2. Field `Device`

| Field | Tipe | Sumber | Catatan |
| --- | --- | --- | --- |
| `id` | `String` (cuid) | server | id internal |
| `externalId` | `String?` | adapter | id menurut vendor |
| `integrationId` | `String?` | server | `null` = perangkat lokal tanpa adapter |
| `name` | `String` | user | wajib |
| `type` | `String` | user | tidak divalidasi |
| `capabilities` | `String[]` | user/adapter | daftar kapabilitas |
| `state` | `Json` | adapter/perintah | state terakhir, bentuk bebas |
| `roomId` | `String?` | user | relasi ke `Room` |
| `homeId` | `String` | user | relasi ke `Home` |

**Field yang tidak ada**: `brand`, `model`, `protocol`, `ipAddress`, `port`,
`firmwareVersion`, `lastSeenAt`, `isOnline`. Yang paling berdampak adalah
`lastSeenAt`: dashboard tidak bisa menampilkan "terakhir dilihat" karena datanya
tidak disimpan, dan `isOnline` tidak ada sebagai kolom — kondisi online
dibakami dari isi `state`.

## 3. Capability

Capability adalah satu-satunya bahasa yang dipahami Nexa (lihat
[architecture.md](architecture.md) §2). Daftar saat ini ada di
`packages/types/src/device.ts`:

```text
power, brightness, color_temperature, temperature, humidity,
motion, contact, lock, position, fan_speed, swing, volume, channel
```

Capability diisi saat perangkat dibuat/diubah, dan **divalidasi terhadap
perangkat nyata sebelum eksekusi perintah**. Kalau perangkat tidak punya
capability itu, jawabannya `CAPABILITY_NOT_SUPPORTED` beserta daftar yang
didukung — bukan diam-diam gagal di vendor.

## 4. Dua aksi suhu yang berbeda

Suhu AC dan suhu warna lampu sengaja dipisah karena keduanya keliru pernah
disamakan:

| Aksi | Capability | Satuan | Rentang |
| --- | --- | --- | --- |
| `set_temperature` | `temperature` | °C (16–28) | 5–35 |
| `set_color_temperature` | `color_temperature` | Kelvin | 1000–10000 |

Perintah AC thermostat yang umum dipakai (`turn_on`, `set_temperature`, `set_fan_speed`,
`set_swing`) dipetakan ke MQTT lewat
`%command% POWER1`, `Setpoint`, `FanSpeed`, `SwingMode`. Detail per vendor
Tasmota ada di [integrations.md](integrations.md).

## 5. State

`state` adalah JSON bebas, jadi bentuknya ditentukan whoever menulisnya. Yang
dibaca dashboard: `power`, `brightness`, `temperature`, `humidity`, `online`.
Kalau `state.online === false`, perintah berikutnya ditolak `DEVICE_OFFLINE`
sebelum menyentuh vendor.

Perangkat hasil discovery yang belum di-*connect* **tidak punya baris `Device`
dan tidak punya `state`**. Setelah connect, baris dibuat dari `DiscoveredDevice`.

## 6. Units & enum

Semua unit memakai angka base: °C, %, K, Hz. Tidak ada field unit di DB —
satuan diasumsikan dari capability. Itu aman selama nama capability tidak berubah
makna; kalau nanti butuh Fahrenheit atau lumen, itu perubahan kontrak, bukan
sekadar konversi tampilan.
