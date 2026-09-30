# NexaHome — Panduan Deployment

Dokumen ini menjelaskan cara menjalankan NexaHome di server (self-hosted) dengan
Docker Compose. Untuk pengembangan lokal, lihat [`DEVELOPMENT.md`](DEVELOPMENT.md).

---

## 1. Ringkasan

`docker-compose.yml` menjalankan lima layanan:

| Layanan | Peran | Port host |
| --- | --- | --- |
| `postgres` | Database (PostgreSQL 16) | 5432 |
| `mqtt` | Broker MQTT (Eclipse Mosquitto) | 1883 |
| `migrate` | Menjalankan Prisma `migrate deploy` lalu berhenti | — |
| `api` | NestJS API | 3001 |
| `web` | Dashboard Next.js | 3000 |

Urutan startup dijamin oleh healthcheck: `api` baru start setelah `postgres` dan
`mqtt` sehat serta `migrate` selesai, dan `web` baru start setelah `api` sehat.

---

## 2. Prasyarat

- Docker Engine 24+ dengan plugin `compose` (atau Colima di macOS).
- Minimal 2 vCPU dan 4 GB RAM (disarankan 4 vCPU / 8 GB).
- Port 3000, 3001, 5432, dan 1883 yang tidak sedang dipakai.
- Certificate TLS bila ingin mengekspos dashboard ke internet (lihat §7).

---

## 3. Instalasi

```bash
git clone https://github.com/imaj2793/NexaHome.git
cd NexaHome

cp .env.example .env
```

Edit `.env`, minimal pada baris berikut:

```bash
# Wajib diganti — API menolak secret default/pendek (< 32 karakter).
JWT_SECRET="$(openssl rand -hex 32)"

# Password database juga sebaiknya diganti.
POSTGRES_PASSWORD="<password-kuat>"
```

Lalu jalankan:

```bash
docker compose up -d --build
```

Perintah di atas membuat image, menjalankan migration, dan menyalakan seluruh
layanan. Untuk melihat progres:

```bash
docker compose logs -f migrate
```

---

## 3b. Deploy dari image rilis (tanpa build lokal)

Setiap tag GitHub (`v*`) memublikasikan tiga image ke GitHub Container Registry
lewat `.github/workflows/release.yml`:

| Image | Isi |
| --- | --- |
| `ghcr.io/imaj2793/nexahome/api` | API (target `runner`) |
| `ghcr.io/imaj2793/nexahome/api-migrate` | one-shot `prisma migrate deploy` |
| `ghcr.io/imaj2793/nexahome/web` | Dashboard Next.js |

Server yang hanya menjalankan NexaHome tidak perlu Node.js, pnpm, atau Docker
BuildKit — cukup menarik image yang sudah jadi:

```bash
git clone https://github.com/imaj2793/NexaHome.git
cd NexaHome
cp .env.example .env
# ganti JWT_SECRET, lalu tentukan versi yang diinginkan:
echo 'NEXAHOME_VERSION=0.2.0' >> .env

docker compose -f docker-compose.yml -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
```

Override `docker-compose.ghcr.yml` mengganti definition `build` dengan `!reset null`,
sehingga Compose tidak pernah membangun image secara lokal. Butuh Docker Compose
v2.24+ (cek dengan `docker compose version`).

Catatan:

- Paket GHCR dibuat **private** secara default. Agar bisa di-pull tanpa login,
  ubah visibility package menjadi Public di GitHub, atau jalankan
  `docker login ghcr.io -u <user> -p <token>`.
- `NEXT_PUBLIC_API_URL` di-inline saat build, jadi image web memakai default
  `http://localhost:3001/api`. Untuk domain sendiri, andalkan reverse proxy di
  host yang sama (§7) atau build image sendiri dengan `docker compose up --build`.
- Untuk tetap membangun dari sumber (kontrol penuh atas versi dan URL API),
  gunakan `docker compose up -d --build` seperti di §3.

---

## 4. Verifikasi

```bash
docker compose ps                 # semua layanan harus Healthy, migrate Exited (0)
curl -fsS http://localhost:3001/api/health
```

Respons yang diharapkan:

```json
{
  "status": "ok",
  "database": "up",
  "uptime": 12.3
}
```

Buka dashboard di <http://localhost:3000> lalu daftar akun pertama.

### Seed data demo (opsional)

Untuk mencoba fitur dengan data contoh (hanya di lingkungan non-produksi):

```bash
pnpm docker:seed
```

Login: `owner@nexahome.local` / `password123`. **Jangan** menjalankan seed di
produksi.

---

## 5. Konfigurasi environment

| Variabel | Wajib | Default | Keterangan |
| --- | --- | --- | --- |
| `JWT_SECRET` | ya | — | Minimal 32 karakter. Ditolak jika `change-me-in-production` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | tidak | `nexahome` | Kredensial database container |
| `POSTGRES_PORT` | tidak | `5432` | Port database di host |
| `API_PORT` / `WEB_PORT` | tidak | `3001` / `3000` | Port published di host |
| `CORS_ORIGIN` | produksi | `http://localhost:3000` | Origin browser yang diizinkan (pisahkan dengan koma) |
| `NEXT_PUBLIC_API_URL` | tidak | `http://localhost:3001/api` | Di-inline saat build web, jadi **harus diset sebelum build** |
| `TRUST_PROXY` | tidak | `0` | Set `1` bila API di belakang reverse proxy |
| `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_MS` | tidak | `10` / `60000` | Rate limit endpoint auth |
| `AI_PROVIDER` | tidak | `mock` | `mock`, `deepseek`, atau `openai` (butuh `AI_API_KEY`) |
| `WHISPER_BIN` / `WHISPER_MODEL` | tidak | kosong | whisper.cpp lokal; kosong = STT nonaktif |
| `MQTT_MODE` | tidak | `mqtt` (compose) | Di compose nilainya `mqtt`; untuk simulasi tanpa broker tambahkan `docker-compose.override.yml` |
| `TASMOTA_MODE` | tidak | `mock` (compose) | `http` butuh akses ke jaringan LAN tempat perangkat berada |

Mode yang tidak dikenal membuat API gagal start dengan pesan jelas — ini disengaja
agar kesalahan konfigurasi ketahuan cepat, bukan diam-diam menjadi no-op.

> Catatan: `NEXT_PUBLIC_API_URL` di-inline ke bundle browser saat build. Ubah
> nilainya lalu jalankan `docker compose up -d --build web` agar berlaku.

---

## 6. Operasi harian

```bash
docker compose ps                 # status
docker compose logs -f api        # log API
docker compose logs --since 10m mqtt
docker compose restart api        # restart satu layanan
docker compose up -d              # start ulang tanpa build
docker compose down               # stop (data tetap tersimpan di volume)
docker compose down -v            # stop + HAPUS volume database
docker images nexahome/*          # daftar image
```

Data PostgreSQL disimpan di volume `postgres_data`, sehingga `docker compose down`
tidak menghapus data. Lakukan backup berkala:

```bash
docker compose exec -T postgres pg_dump -U nexahome nexahome > nexahome-$(date +%F).sql
```

---

## 7. Ekspos ke internet (TLS)

Jangan mengekspos port 3000/3001 langsung ke internet. Letakkan reverse proxy
(nginx, Caddy, atau Traefik) di depannya:

```nginx
server {
    server_name nexahome.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket untuk notifikasi perangkat (Socket.IO)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Setelah memakai reverse proxy:

1. Set `TRUST_PROXY=1` di `.env` agar rate limiting memakai IP asli (bukan IP proxy).
2. Set `CORS_ORIGIN="https://nexahome.example.com"`.
3. Set `NEXT_PUBLIC_API_URL="https://nexahome.example.com/api"`, lalu build ulang
   service web.

MQTT broker dalam compose **tidak** memakai TLS dan sebaiknya tidak dipublikasikan.
Untuk perangkat di luar jaringan rumah, gunakan VPN (mis. WireGuard/Tailscale)
atau broker MQTT dengan TLS.

---

## 8. Resource image

Image yang dibangun cukup besar karena membawa `node_modules` (pnpm virtual store)
dan engine Prisma:

| Image | Ukuran (perkiraan) |
| --- | --- |
| `nexahome/api` | ~900 MB |
| `nexahome/web` | ~520 MB |

Butuh ruang ~1.5 GB untuk image dan build cache. Menghemat ruang:

```bash
docker builder prune          # hapus cache build
docker image prune -a         # hapus image tidak terpakai
```

---

## 9. Upgrade

```bash
git pull
docker compose up -d --build
```

`migrate` service menjalankan `prisma migrate deploy` (bukan `migrate dev`),
sehingga migration baru diterapkan otomatis dan aman untuk data yang sudah ada.
Baca `CHANGELOG.md` untuk daftar perubahan antar versi.

---

## 10. Troubleshooting

| Gejala | Penyebab & solusi |
| --- | --- |
| `api` restart loop, log menyebut `JWT_SECRET` | `JWT_SECRET` masih default atau < 32 karakter. Generate ulang dengan `openssl rand -hex 32` |
| `migrate` keluar dengan kode != 0 | Jalankan `docker compose logs migrate`; biasanya `DATABASE_URL` salah atau port 5432 bentrok |
| Web 502 / dashboard kosong | `NEXT_PUBLIC_API_URL` tidak sesuai; set lalu `docker compose up -d --build web` |
| Log `Integrasi MQTT gagal connect` | Broker belum siap atau URL salah. API tetap jalan; cek `docker compose logs mqtt` |
| `CORS` diblokir browser | `CORS_ORIGIN` tidak memuat origin dashboard (tanpa garis slash di akhir) |
| Image build gagal di `prisma generate` | Cache Docker rusak: `docker builder prune -a` lalu build ulang |

---

## 11. Lihat juga

- [`DEVELOPMENT.md`](DEVELOPMENT.md) — pengembangan lokal
- [`API.md`](API.md) — referensi endpoint
- [`SECURITY.md`](../SECURITY.md) — pelaporan kerentanan
- [`CHANGELOG.md`](../CHANGELOG.md) — riwayat perubahan
