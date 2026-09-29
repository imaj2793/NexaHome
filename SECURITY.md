# Kebijakan Keamanan

NexaHome adalah proyek open-source dan kami menghargai laporan kerentanan yang
berkualitas. Halaman ini menjelaskan cara melaporkan masalah keamanan secara
bertanggung jawab.

---

## Versi yang Didukung

| Versi | Didukung |
| --- | --- |
| `0.1.x` (rilis awal) | Ya |
| `main` (belum rilis) | Ya, paling cepat mendapat perbaikan |

Karena proyek masih muda, satu lini rilis utama (0.2.x) akan tetap mendapat
perbaikan keamanan.

---

## Cara Melapor

**Jangan membuka issue publik untuk kerentanan.** Issue publik memberi tahu
siapa pun bahwa masalahnya ada sebelum diperbaiki.

Gunakan salah satu:

1. **GitHub Security Advisories** — tab **Security** pada repository, lalu
   **Report a vulnerability**. Ini pilihan paling ideal karena tersedia
   private vulnerability advisory.
2. **Kontak langsung** — hubungi maintainer lewat halaman profil GitHub.

Sertakan:

- Jenis kerentanan (mis. broken access control, SQL injection, XSS, SSRF).
- Lokasi atau endpoint yang terdampak.
- Langkah reproduksi yang minimal dan jelas.
- Dampak yang diperkirakan: data apa yang bisa bocor, privilege escalation, dan lain-lain.
- Versi yang terdampak (tag, atau `git rev-parse HEAD`).

Tidak perlu menemukan exploit yang bekerja sempurna. Laporan yang jelas dan
terperinci sudah sangat berharga.

---

## Target Respons

| Tahap | Target |
| --- | --- |
| Konfirmasi penerimaan | 3 hari kerja |
| Triage awal dan severity | 7 hari kerja |
| Perbaikan untuk severity tinggi/kritis | secepatnya setelah triage |

Laporan yang kompleks mungkin membutuhkan waktu lebih lama. Anda akan tetap
menerima kabar progres, termasuk saat perilaku yang diharapkan berubah atau
masalah ditutup.

---

## Apa yang Dikategorikan Kerentanan

**Termasuk:**

- Autentikasi atau otorisasi yang rusak.
- Injeksi (SQL, NoSQL, command).
- XSS, CSRF, SSRF.
- Kebocoran secret, token, atau data pengguna.
- Path traversal dan akses file di luar direktori yang seharusnya.
- Bypass autentikasi.
- Dependensi dengan advisory aktif yang dieksploitasi lewat kode NexaHome.

**Umumnya tidak termasuk:**

- Mode mock atau konfigurasi yang secara sengaja tidak aman tetapi terdokumentasi.
- Pesan error yang membocorkan informasi non-sensitif.
- Denial of service lewat request sah dalam volume sangat besar.
- Masalah pada dependensi transitif yang belum punya advisory publik.
- Serangan pada jaringan lokal (misalnya rogue device di LAN Anda sendiri).

---

## Praktik Keamanan NexaHome

Sebagai dasar, proyek ini sudah menerapkan:

- Password di-hash dengan bcrypt.
- Refresh token dengan rotasi dan deteksi reuse; logout merevoke token.
- Rate limiting pada endpoint auth.
- `JWT_SECRET` produksi divalidasi: ditolak jika memakai nilai default atau
  kurang dari 32 karakter.
- `helmet()` dan CORS berbasis allowlist origin.
- `pnpm audit --prod` bersih dan dijalankan di CI.
- Dukungan `TRUST_PROXY` agar rate limiting tetap benar di belakang reverse proxy.

Panduan hardening lebih lengkap ada di
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#7-ekspos-ke-internet-tls).

---

## Pengakuan

Laporan yang tervalidasi dan telah diperbaiki akan diakui di `CHANGELOG.md`
(secara publik atas nama Anda bila Anda setuju, atau anonim bila tidak).
