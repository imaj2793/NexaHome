# Automation NexaHome

## 1. Bentuk data

`Automation` punya `trigger` (JSON) dan `actions` (JSON):

```jsonc
{
  "trigger": { "type": "SCHEDULE", "config": { "time": "19:30" } },
  "actions": [
    { "type": "deviceCommand", "deviceId": "abc", "action": "turn_on", "value": null }
  ]
}
```

Endpoint: `GET/POST/PATCH/DELETE /automations`. Semua operasi dibatasi ke rumah
yang accessed owner atau anggota.

## 2. Yang benar-benar dievaluasi

`AutomationService.onModuleInit` menjalankan `setInterval(30s)` → `tick()`:

1. Ambil waktu sekarang `HH:mm`.
2. Kalau sama dengan `lastFiredMinute`, berhenti (cegah double-run per menit).
3. Query semua automation aktif dengan trigger `SCHEDULE`.
4. Cocokkan `trigger.config.time` dengan waktu sekarang.
5. Eksekusi actions lewat `DeviceCoreService.executeCommand`.

Jadi **hanya jadwal waktu** yang jalan. Kalau sebuah automation gagal
menjalankan perintah, errornya masuk ke log dan automation-nya tetap aktif — ada
yang mencoba lagi menit berikutnya.

## 3. Yang belum ada

| Fitur | Status |
| --- | --- |
| Trigger `DEVICE_STATE` | ada di enum, tidak dievaluasi |
| Trigger `SENSOR` | ada di enum, tidak dievaluasi |
| Kondisi/IF-THEN | tidak ada; `AutomationTrigger` tidak punya kondisi |

`AutomationTriggerType` punya `SCHEDULE`, `DEVICE_STATE`, `SENSOR` — tapi
`tick()` hanya memfilter `SCHEDULE`. Menulis trigger `DEVICE_STATE` akan
membuat automation yang diam-diam tidak pernah jalan.

## 4. Batasan yang perlu diketahui

- `lastFiredMinute` disimpan di memori proses. Restart API di tengah menit itu
  berarti jadwal terlewat, dan hanya satu instance API yang mengevaluasi jadwal.
  Menjalankan lebih dari satu replica perlu penyimpanannya di database atau
  lock terdistribusi.
- Pencocokan waktu memakai waktu lokal server. Kalau zona waktu server ≠ zona
  waktu pengguna, jadwalnya meleset — `config.time` tidak menyimpan timezone.
- Eksekusi memakai account sistem, bukan account pengguna yang membuat
  automation. Jadi privileges perintah mengikuti device, bukan pemilik automation.

## 5. Menambah trigger baru

Checklist:

1. Tambah nilai enum di `schema.prisma` (`AutomationTriggerType`) **dan** di
   Zod/union di sisi web.
2. Implementasikan evaluasinya di `tick()` atau event listener.
3. Tulis test yang memicu trigger itu; kalau hanya menambah enum tanpa
   evaluasi, tulis di sini bahwa belum berjalan.
