#!/usr/bin/env bash
# NexaHome — siapkan TLS + password untuk broker MQTT.
#
#   ./scripts/mqtt-tls.sh                    # buat CA, sertifikat, password file
#   ./scripts/mqtt-tls.sh --force            # buat ulang, timpa yang ada
#   ./scripts/mqtt-tls.sh --sans example.com 192.168.1.10
#   ./scripts/mqtt-tls.sh --check            # hanya audit; exit != 0 kalau bermasalah
#
# Yang dibuat:
#   docker/mosquitto/ca/ca.key               private key CA (tidak pernah di-mount)
#   docker/mosquitto/config/ca.crt           CA publik (di-mount ke broker & API)
#   docker/mosquitto/certs/server.{crt,key}  sertifikat server + chain (di-mount ke broker)
#   docker/mosquitto/config/passwd           password file mosquitto
#   .env                                     diisi MQTT_USERNAME/MQTT_PASSWORD
#
# Kenapa CA terpisah dari sertifikat server: sertifikat self-signed tidak bisa
# menjadi trust anchor dirinya sendiri, jadi perangkat dan browser akan
# menolaknya meski sertifikatnya sudah dipasang sebagai CA. Dengan CA terpisah,
# perangkat cukup percaya satu file CA dan sertifikat server bisa diganti
# kapan saja tanpa memasang ulang CA di semua perangkat.
#
# CA publik ditaruh di docker/mosquitto/config/ karena direktori itu sudah
# di-mount ke broker dan API — CA publik memang harus bisa dibaca keduanya.
# Private key CA tetap di docker/mosquitto/ca/ yang tidak pernah di-mount.
#
# Tanpa file di atas, listener 8883 (mqtts) dan 8884 (wss/443) tidak bisa start.
# Listener 1883 internal tetap jalan.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERTS="$ROOT/docker/mosquitto/certs"
CA_DIR="$ROOT/docker/mosquitto/ca"
CONFIG="$ROOT/docker/mosquitto/config"
CA_KEY="$CA_DIR/ca.key"
# CA publik di direktori config supaya ikut ter-mount ke broker dan API.
CA_CRT="$CONFIG/ca.crt"
ENV_FILE="$ROOT/.env"
PASSWD_FILE="$CONFIG/passwd"

# Image untuk `mosquitto_passwd`. Bisa diganti ke image internal kalau
# registry lokal dipakai.
MOSQUITTO_IMAGE="${MOSQUITTO_IMAGE:-eclipse-mosquitto:2}"

FORCE=0
CHECK_ONLY=0
EXTRA_SANS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    --check) CHECK_ONLY=1 ;;
    --sans) shift; EXTRA_SANS+=("$1") ;;
    -h|--help) sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^#\{1,\} \{0,1\}//'; exit 0 ;;
    *) echo "Argumen tidak dikenal: $1" >&2; exit 2 ;;
  esac
  shift
done

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl tidak ditemukan. Pasang OpenSSL lalu jalankan ulang." >&2
  exit 1
fi

mkdir -p "$CERTS" "$CA_DIR"

# ── --check:-monitoring tanpa mengubah apa pun ────────────
# Sertifikat kedaluwarsa tidak memberi gejala di broker: yang gagal hanya
# perangkat yang baru terhubung. Bentuknya cocok untuk cronjob
# yang mengirim alarm saat tinggal_hitung hari Threshold.
if [ "$CHECK_ONLY" -eq 1 ]; then
  WARN_DAYS="${MQTT_TLS_WARN_DAYS:-30}"
  STATUS=0
  report() {
    if [ "$2" -eq 0 ]; then printf '  OK   %s\n' "$1"; else printf '  GAGAL %s\n' "$1"; STATUS=1; fi
  }

  for file in "$CA_CRT" "$CERTS/server.crt" "$CERTS/server.key" "$PASSWD_FILE"; do
    report "ada: ${file#"$ROOT"/}" "$([ -s "$file" ] && echo 0 || echo 1)"
  done

  # openssl x509 -checkend 0 = belum kedaluwarsa; dipakai untuk tanggal,
  # sementara verify -CAfile memeriksa rantai dan nama host.
  days_left() {
    # macOS LibreSSL tidak punya -checkend, jadi dihitung dari notAfter.
    openssl x509 -in "$1" -noout -enddate 2>/dev/null |
      sed 's/notAfter=//' |
      python3 -c 'import sys,time; print(int((time.mktime(time.strptime(sys.stdin.read().strip(), "%b %d %H:%M:%S %Y GMT")) - time.time()) // 86400))' 2>/dev/null || echo "?"
  }

  for pair in "CA:$CA_CRT" "server:$CERTS/server.crt"; do
    label="${pair%%:*}"; file="${pair#*:}"
    days="$(days_left "$file")"
    if [ "$days" = "?" ]; then
      report "$label tanggal kedaluwarsa terbaca" 1
    elif [ "$days" -lt "$WARN_DAYS" ]; then
      report "$label kedaluwarsa dalam $days hari (perlu CA baru: --force)" 1
    else
      printf '  OK   %s masih valid %s hari lagi\n' "$label" "$days"
    fi
  done

  verify="$(openssl verify -CAfile "$CA_CRT" "$CERTS/server.crt" 2>&1)" &&
    report "chain server diverifikasi terhadap CA" 0 ||
    report "chain server: $verify" 1

  # Broker menerima client berdasarkan nama host di SAN, bukan nama file.
  # `-verify_hostname` tidak ada di LibreSSL (bawaan macOS), jadi SAN dibaca
  # dari teks sertifikat dan dicocokkan di sini.
  SAN_LIST="$(openssl x509 -in "$CERTS/server.crt" -noout -text 2>/dev/null |
    sed -n '/Subject Alternative Name/,+1p' | tail -1)"
  # Koma di depan supaya entri pertama juga punya pemisah kiri.
  SAN_LIST=",$SAN_LIST"
  for host in localhost mosquitto mqtt; do
    case "$SAN_LIST," in
      # Tanpa spasi setelah koma: entri pertama tidak punya pemisah kiri.
      *"DNS:$host,"*) report "SAN memuat $host" 0 ;;
      *) report "SAN tidak memuat $host (hostname ini akan ditolak TLS)" 1 ;;
    esac
  done

  env_password="$(sed -n 's/^MQTT_PASSWORD="\(.*\)"$/\1/p' "$ENV_FILE" 2>/dev/null | head -1)"
  report "MQTT_PASSWORD terisi di .env" "$([ -n "$env_password" ] && echo 0 || echo 1)"

  exit "$STATUS"
fi

# ── CA ───────────────────────────────────────────────────
if [ -f "$CA_KEY" ] && [ -f "$CA_CRT" ] && [ "$FORCE" -eq 0 ]; then
  echo "CA sudah ada: $CA_CRT (pakai --force untuk buat ulang)"
else
  echo "Membuat CA lokal"
  openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes \
    -keyout "$CA_KEY" \
    -out "$CA_CRT" \
    -subj "/CN=NexaHome Device CA/O=NexaHome" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    2>/dev/null
  chmod 700 "$CA_DIR"
  chmod 600 "$CA_KEY"
  chmod 644 "$CA_CRT"
  echo "  → $CA_CRT"
fi

# ── Sertifikat server ────────────────────────────────────
if [ -f "$CERTS/server.crt" ] && [ "$FORCE" -eq 0 ]; then
  echo "Sertifikat server sudah ada: $CERTS/server.crt"
else
  # SAN wajib: hostname saja sudah tidak dianggap valid oleh TLS modern.
  # `mqtt` wajib ada karena API konek ke `mqtts://mqtt:8883` lewat nama service
  # compose, bukan lewat localhost.
  SAN_LIST="DNS:localhost,DNS:mosquitto,DNS:mqtt,DNS:nexahome,DNS:nexahome.local,IP:127.0.0.1"
  # `hostname` di beberapa mesin mengembalikan IP, jadi diklasifikasi sama
  # seperti argumen --sans: angka dan titik berarti IP, selain itu DNS.
  for entry in "$(hostname 2>/dev/null || true)" ${EXTRA_SANS+"${EXTRA_SANS[@]}"}; do
    case "$entry" in
      '' ) continue ;;
      *:*) SAN_LIST="$SAN_LIST,$entry" ;;
      *[!0-9.]*) SAN_LIST="$SAN_LIST,DNS:$entry" ;;
      *) SAN_LIST="$SAN_LIST,IP:$entry" ;;
    esac
  done

  echo "Membuat sertifikat server untuk: $SAN_LIST"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT

  openssl req -new -newkey rsa:2048 -sha256 -nodes \
    -keyout "$TMP/server.key" \
    -out "$TMP/server.csr" \
    -subj "/CN=nexahome.local/O=NexaHome" \
    2>/dev/null

  # Extfile dipakai, bukan -addext/-copy_extensions: keduanya tidak ada di
  # LibreSSL yang masih jadi openssl bawaan macOS.
  cat >"$TMP/server.ext" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=$SAN_LIST
EOF

  # Serial disimpan di direktori CA, bukan di sebelah ca.crt: direktori config
  # di-mount ke broker dan API, dan tidak ada gunanya membawa file serial ke
  # sana.
  openssl x509 -req -in "$TMP/server.csr" \
    -CA "$CA_CRT" -CAkey "$CA_KEY" -CAcreateserial -CAserial "$CA_DIR/ca.srl" \
    -days 825 -sha256 -extfile "$TMP/server.ext" \
    -out "$TMP/leaf.crt" 2>/dev/null

  # Broker mengirim berantai: leaf dulu, lalu CA. Tanpa CA di rantai, klien
  # hanya percaya leaf dan harus dipasangi trust anchor secara manual.
  cat "$TMP/leaf.crt" "$CA_CRT" >"$CERTS/server.crt"
  cp "$TMP/server.key" "$CERTS/server.key"

  # Broker drop ke user `mosquitto` (uid 1883) sebelum membaca sertifikat,
  # jadi file harus tetap terbaca setelah privilege dilepas. Kepemilikan file
  # mengikuti user host karena di-bind mount, sehingga izin baca untuk semua
  # user di dalam container adalah satu-satunya yang tidak bisa gagal.
  chmod 755 "$CERTS"
  chmod 644 "$CERTS/server.crt" "$CERTS/server.key"
  echo "  → $CERTS/server.crt"
  echo "  → $CERTS/server.key"
fi

# ── Password broker ──────────────────────────────────────
# Password file dibuat image mosquitto lewat `mosquitto_passwd`, jadi tidak
# butuh mosquitto terpasang di host.
MQTT_USER="${MQTT_USER:-nexahome}"
MQTT_PASSWORD="${MQTT_PASSWORD:-}"
ENV_PASSWORD="$(sed -n 's/^MQTT_PASSWORD="\(.*\)"$/\1/p' "$ENV_FILE" 2>/dev/null | head -1)"

if [ -z "$MQTT_PASSWORD" ] && [ -n "$ENV_PASSWORD" ] && [ "$FORCE" -eq 0 ]; then
  # Pakai password yang sudah ada supaya API dan broker tidak berbeda.
  MQTT_PASSWORD="$ENV_PASSWORD"
  echo "Memakai MQTT_PASSWORD yang sudah ada di .env"
fi
if [ -z "$MQTT_PASSWORD" ]; then
  MQTT_PASSWORD="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-24)"
fi

echo "Membuat password file untuk user '$MQTT_USER'"
# `mosquitto_passwd -c` menolak menimpa file yang sudah ada. File ini dikelola
# utuh oleh skrip ini (satu user broker), jadi dihapus dulu lebih jujur
# daripada gagal di tengah jalan.
rm -f "$PASSWD_FILE"
docker run --rm \
  -v "$CONFIG:/mosquitto/config" \
  "$MOSQUITTO_IMAGE" \
  mosquitto_passwd -b -c "/mosquitto/config/passwd" "$MQTT_USER" "$MQTT_PASSWORD" \
  >/dev/null
chmod 600 "$PASSWD_FILE"
echo "  → $PASSWD_FILE"

# ── .env ─────────────────────────────────────────────────
# `MQTT_PASSWORD=""` di .env.example dianggap belum diisi: kalau tidak, broker
# dapat password acak tapi API tetap tanpa kredensial, dan listener TLS menolak
# semua koneksi dengan pesan yang tidak menunjuk ke penyebabnya.
if [ -n "$ENV_PASSWORD" ] && [ "$FORCE" -eq 0 ]; then
  echo ".env sudah punya MQTT_PASSWORD; tidak diubah."
  if [ "$ENV_PASSWORD" != "$MQTT_PASSWORD" ]; then
    echo "PERINGATAN: password di .env berbeda dari yang dipakai untuk passwd file."
    echo "             Jalankan ulang dengan --force, atau samakan keduanya."
  fi
else
  python3 - "$ENV_FILE" "$MQTT_USER" "$MQTT_PASSWORD" <<'PY'
import pathlib, re, sys

env, user, password = sys.argv[1], sys.argv[2], sys.argv[3]
path = pathlib.Path(env)
text = path.read_text() if path.exists() else ""

if re.search(r'^MQTT_PASSWORD=', text, re.M):
    text = re.sub(r'^MQTT_USERNAME=.*$', 'MQTT_USERNAME="%s"' % user, text, flags=re.M)
    text = re.sub(r'^MQTT_PASSWORD=.*$', 'MQTT_PASSWORD="%s"' % password, text, flags=re.M)
else:
    text = text.rstrip('\n') + (
        '\n\n# Diisi scripts/mqtt-tls.sh untuk listener TLS broker (8883/443).\n'
        'MQTT_USERNAME="%s"\nMQTT_PASSWORD="%s"\n' % (user, password)
    )
path.write_text(text)
PY
  echo "MQTT_USERNAME/MQTT_PASSWORD ditulis ke .env"
fi

cat <<EOF

Selesai. Listener broker:

  mqtt://localhost:1883   internal compose saja (tidak dipublikasikan)
  mqtts://localhost:8883  TLS, user $MQTT_USER
  wss://localhost:443    TLS + WebSocket, user $MQTT_USER

Langkah berikutnya:

  docker compose up -d --build mqtt api
  ./scripts/mqtt-tls.sh --check
  openssl s_client -connect localhost:8883 -CAfile docker/mosquitto/config/ca.crt

Perangkat Tasmota/ESPHome harus mempercayai CA ini:
  $CA_CRT

Untuk produksi, ganti CA lokal dengan CA asli (Let's Encrypt) dan arahkan
certfile/keyfile ke sertifikat yang ditandatangani CA itu — lihat
docs/DEPLOYMENT.md §7. CA lokal hanya untuk jaringan sendiri.
EOF