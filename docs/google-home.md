# Google Home

**NexaHome tidak punya integrasi Google Home sama sekali.**

Tidak ada `SYNC`, tidak ada webhook account linking, tidak ada lokal SDK
Google, tidak ada baris kode untuk HomeGraph, dan tidak ada satu pun dependensi
Google Home di `package.json`.

## Kenapa dokumen ini ada

Supaya tidak ada yang mengira fiturnya tersembunyi di balik flag. Kalau Anda
mencari Google Home di repo ini, hasilnya nol — termasuk di enum integrasi.

## Yang sebenarnya dibutuhkan

Google Home bukan hal yang bisa dikerjakan sebagai adapter biasa. Kalau suatu saat
mau dikerjakan, itu proyek terpisah dengan prasyarat berikut:

| Prasyarat | Kenapa |
| --- | --- |
| Project di Google Cloud + HomeGraph API aktif | device harus terdaftar di graph, tidak bisa dari server lokal |
| OAuth account linking (Google Identity Services) | linking user NexaHome ↔ akun Google |
| SYNC intent + fulfillment terverifikasi | Google mereview; intent yang tidak valid ditolak |
| Token refresh & penyimpanan aman | token Google berumur panjang, harus dienkripsi seperti kredensial lain |
| URL webhook publik | Google memanggil balik dari internet, butuh domain + TLS |
| Metadata device & traits per kapabilitas | trait Google ≠ capability Nexa; perlu pemetaan |

Persetujuan SYNC biasanya butuh waktu berminggu-minggu dan bisa ditolak. Tudo
itu belum dikerjakan di NexaHome.

## Yang sudah ada sebagai fondasi

Tidak banyak, tapi tidak nol:

- `Device.capabilities` bisa dipetakan ke trait Google (power → `action.devices.traits.OnOff`, AC → `action.devices.traits.TemperatureSetting`).
  Lihat [device-model.md](device-model.md).
- Infrastruktur kredensial terenkripsi sudah ada
  ([integrations.md](integrations.md)) dan bisa dipakai untuk token Google —
  tinggal pakai kembali `credential-crypto.ts`.
- AI sudah punya jalur ke perintah ([voice.md](voice.md)), yang relevan untuk
  Nexa (bukan Google).

## Kalau nanti dikerjakan

Jangan mulai dari kode. Mulai dari:

1. Daftar di Google Home Developer Center, baca dokumentasi resmi SYNC.
2. Buat project sandbox dan validasi intent minimal.
3. Baru tulis fulfilment-nya, dan daftar di sini dengan status yang jujur —
   termasuk kalau masih menunggu review.
