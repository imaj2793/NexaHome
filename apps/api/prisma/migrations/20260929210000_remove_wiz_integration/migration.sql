-- Menghapus integrasi WiZ sepenuhnya.
--
-- Alasannya: protokol UDP WiZ (port 38899) hanya berfungsi bila API berjalan
-- langsung di jaringan lokal. Di dalam container, broadcast keluar tetapi
-- balasan unicast dari lampu tidak sampai (NAT), sehingga scan selalu kosong
-- dan fitur "tambah perangkat" memakai data simulasi yang menyesatkan.
--
-- Urutan penting: anak (scene/automation action) → device → integration → enum.

-- 1. Aksi yang menunjuk perangkat WiZ dummy dari seed lama.
--    Kolom deviceId di kedua tabel ini bukan foreign key, jadi harus dihapus manual.
DELETE FROM "SceneAction"
WHERE "deviceId" IN (
  SELECT "id" FROM "Device" WHERE "integrationId" IN (
    SELECT "id" FROM "Integration" WHERE "type" = 'WIZ'
  )
);

DELETE FROM "AutomationAction"
WHERE "deviceId" IN (
  SELECT "id" FROM "Device" WHERE "integrationId" IN (
    SELECT "id" FROM "Integration" WHERE "type" = 'WIZ'
  )
);

-- 2. Perangkat dummy WiZ (Lampu Ruang Tamu / Lampu Kamar).
DELETE FROM "Device"
WHERE "integrationId" IN (SELECT "id" FROM "Integration" WHERE "type" = 'WIZ');

-- 3. Integrasi WiZ.
DELETE FROM "Integration" WHERE "type" = 'WIZ';

-- 4. Buang nilai 'WIZ' dari enum.
--    PostgreSQL tidak mendukung DROP VALUE pada enum, jadi tipe dibuat ulang.
CREATE TYPE "IntegrationType_new" AS ENUM ('MQTT', 'ESP32', 'HOME_ASSISTANT', 'TASMOTA', 'SHELLY');

ALTER TABLE "Integration" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Integration"
  ALTER COLUMN "type" TYPE "IntegrationType_new"
  USING ("type"::text::"IntegrationType_new");

DROP TYPE "IntegrationType";
ALTER TYPE "IntegrationType_new" RENAME TO "IntegrationType";
