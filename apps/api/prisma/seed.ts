import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Seed dasar: akun owner, satu home, dan beberapa ruangan.
 *
 * Sengaja TIDAK membuat perangkat, scene, atau otomasi. Data perangkat
 * dummy pernah membuat hasil scan menampilkan lampu fiktif ("WiZ Bulb
 * Ruang Tamu") yang tidak ada di dunia nyata — itu menyesatkan. Sekarang
 * integrasi hanya melaporkan perangkat yang benar-benar ditemukan di
 * jaringan (MQTT, mDNS), dan perangkat bisa ditambahkan lewat scan atau
 * input manual.
 *
 * Untuk data demo yang disengaja, jalankan: `pnpm db:seed:demo`.
 */
async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  const user = await prisma.user.upsert({
    where: { email: 'owner@nexahome.local' },
    update: {},
    create: {
      email: 'owner@nexahome.local',
      name: 'NexaHome Owner',
      passwordHash,
      role: 'OWNER',
    },
  });

  let home = await prisma.home.findFirst({ where: { ownerId: user.id } });
  if (!home) {
    home = await prisma.home.create({
      data: { name: 'Rumah', ownerId: user.id },
    });
  }

  const roomNames = ['Ruang Tamu', 'Kamar Tidur', 'Dapur'];
  for (const name of roomNames) {
    await prisma.room.upsert({
      where: { homeId_name: { homeId: home.id, name } },
      update: {},
      create: { name, homeId: home.id },
    });
  }

  // Integrasi default. Mode diambil dari env (MQTT_MODE / TASMOTA_MODE),
  // jadi config disimpan kosong — status sebenarnya dilihat dari log API.
  await prisma.integration.upsert({
    where: { id: 'integration_mqtt' },
    update: {},
    create: {
      id: 'integration_mqtt',
      name: 'MQTT',
      type: 'MQTT',
      homeId: home.id,
    },
  });

  await prisma.integration.upsert({
    where: { id: 'integration_tasmota' },
    update: {},
    create: {
      id: 'integration_tasmota',
      name: 'Tasmota',
      type: 'TASMOTA',
      homeId: home.id,
    },
  });

  await prisma.notification.upsert({
    where: { id: 'notif_welcome' },
    update: {},
    create: {
      id: 'notif_welcome',
      userId: user.id,
      title: 'Selamat datang di NexaHome',
      body: 'Tambahkan perangkat lewat menu Devices → Scan, atau daftarkan manual. ' +
        'Scan hanya menampilkan perangkat yang benar-benar ada di jaringan Anda.',
    },
  });

  console.log(
    `✅ Seed selesai. Login: ${user.email} / password123 (home: ${home.name})`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
