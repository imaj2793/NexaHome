# Autentikasi & Otorisasi NexaHome

## 1. Autentikasi

| Hal | Nilai |
| --- | --- |
| Skema | JWT bearer |
| Access token | `JWT_EXPIRES_IN`, default `7d` |
| Refresh token | `JWT_REFRESH_EXPIRES_DAYS`, default `30` |
| Password | bcrypt, cost 10 |
| Simpan token | `localStorage` (web) |

Endpoint: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`,
`POST /auth/logout`, `GET /auth/me`.

`JWT_SECRET` **wajib** diisi. `validateEnv` menolak nilai kosong maupun nilai
default dari `.env.example`, dan `AuthModule`/`JwtStrategy` gagal startup kalau
secret kosong. Tidak ada fallback ke secret bawaan — sebelumnya ada, dan itu
artinya semua deployment tanpa konfigurasi bertanda tangan dengan kunci yang
sama-sama orang tahu.

## 2. Otorisasi: pemilik ATAU anggota

Resource yang aksesnya bergantung `HomeMember`: homes, devices, rooms, scenes,
automations, energy, activity logs, integrations, discovery, katalog Nexa.

Jadi akses mengikuti aturan: **pemilik rumah atau anggota di rumah itu**.
Bukan "semua user yang login", dan bukan juga "hanya owner".

```text
Hanya pemilik (owner):
  PATCH/DELETE /homes/:id
  POST   /homes/:id/members, DELETE /homes/:id/members/:memberId
  POST   /integrations               (membuat integrasi baru)
  PATCH  /integrations/:id           (termasuk menyimpan ulang kredensial)
```

Anggota rumah bisa membaca dan menjalankan perangkat, tapi tidak bisa
menambah anggota lain atau mengubah integrasi.

### Keputusan: anggota punya kontrol penuh

Anggota rumah mendapat hak yang sama dengan pemilik atas isi rumah:
membuat, mengubah, dan menghapus device serta room, dan mengirim command ke
device mana pun di rumah itu. `HomeMember` tidak punya kolom `role` — kolom
itu pernah ada (default `USER`) tapi tidak pernah dibaca kode, jadi hanya
menyesatkan.

Konsekuensinya, dan ini yang perlu disadari:

- Satu anggota yang tokennya bocor bisa menghapus semua device dan room
  rumah tersebut. Yang tetap terbatas hanya operasi di daftar "hanya pemilik"
  di atas, termasuk seluruh kredensial integrasi.
- Tidak ada granularitas antara dua anggota: tidak ada yang bisa "hanya
  boleh menyalakan lampu".
- Kalau ini jadi tidak neoliberal, langkah berikutnya adalah menambah
  `HomeMember.role` dan membedakannya di `DevicesService`/`RoomsService`,
  bukan setengah-setengah.

`User.role` (default `OWNER`) punya masalah serupa dan belum disentuh: tidak
ada kode yang membacanya.

## 3. Model user

Satu user bisa punya banyak rumah lewat `HomeMember`. Setiap `Home` punya satu
`ownerId`. Relasi ini yang dipakai service untuk menyaring query — filter
`accessibleHomes` diterapkan di level query (bukan setelah ambil semua data),
supaya data rumah lain tidak pernah masuk ke memori service.

## 4. WebSocket

`socket.io` tidak membaca header Authorization, jadi token dikirim saat
handshake:

```js
io(API_URL, { auth: { token: accessToken } })
```

Setelah connect, client mengirim `home:join`:

```js
socket.emit('home:join', { homeId })
```

Server memverifikasi token (JWT valid **dan** user masih ada di database),
lalu mengecek keanggotaan sebelum memasukkan client ke room `home:<id>`.
Penolakan dikirim sebagai `error:code` dengan kode `UNAUTHORIZED` atau
`FORBIDDEN`.

Dua detail implementasi yang mudah salah dan sudah ditangani:

- Listener `home:join` didaftarkan **sebelum** proses auth selesai. Client
  обычно langsung emit begitu koneksinya menyala; kalau listener baru muncul
  setelah `await`, join-nya hilang tanpa balasan.
- Semua emit ke room, tidak ada broadcast global. Client hanya menerima event
  rumah yang di-join-nya.

## 5. Yang diuji otomatis

`apps/api/test/security.e2e-spec.ts` menjalankan verifikasi berikut terhadap
API sungguhan (bukan mock), jadi regresinya tertangkap CI:

| Area | Yang dijaga |
| --- | --- |
| Handshake WS | tanpa token, token rusak, token user yang sudah dihapus, token via query string |
| Isolasi WS | `FORBIDDEN` saat join room orang lain; event rumah lain tidak diterima |
| Isolasi HTTP | 404 untuk device, room, dan integrasi milik rumah orang lain; state tidak berubah setelah perintah ditolak |
| Room | device tidak bisa diarahkan ke room rumah lain (baik saat create maupun update) |
| Kredensial | tidak pernah kembali apa adanya; anggota boleh baca tapi tidak boleh tulis |

Dua hal yang ditemukan test ini dan sudah diperbaiki:

- `DevicesService.update` menulis `roomId` tanpa memverifikasi rumah. Perangkat
  bisa diarahkan ke room milik orang lain, dan karena respons device
  menyertakan `room`, nama room itu ikut terbaca. `create` punya masalah yang
  sama.
- API menjawab 404 (bukan 403) untuk sumber daya milik rumah orang lain, dengan
  sengaja supaya keberadaan sumber daya tidak terkonfirmasi.

Tidak ada route `GET /integrations/:id`; integrasi hanya bisa dibaca lewat
`GET /integrations`.

## 6. Yang belum ada

- Refresh token disimpan hashed di database dengan rotasi (acak lagi setiap
  refresh) dan dicabut saat logout. Yang **belum**: deteksi reuse token —
  token lama yang dicabut masih diterima sampai kedaluwarsa.
- Rate limiting belum ada di API maupun WebSocket handshake.
- Password reset / verifikasi email belum ada.
- Granularitas antar anggota belum ada: semua anggota punya kontrol penuh atas
  device dan room (lihat §2). Kolom `HomeMember.role` sudah dihapus karena
  tidak pernah dipakai.

## 7. Referensi kode

- `apps/api/src/auth/` — strategy, guard, service rotasi token.
- `apps/api/src/common/errors/` — kontrak error §13.
- `apps/api/src/device-core/device.gateway.ts` — handshake + room.
- `apps/api/src/homes/home-access.ts` — filter akses owner/member.
