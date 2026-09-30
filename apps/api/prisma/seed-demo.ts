import { PrismaClient } from '@prisma/client';

/**
 * Seed demo — OPSIONAL dan tidak dijalankan oleh `pnpm db:seed`.
 *
 * Membuat perangkat, scene, dan otomasi fiktif supaya UI bisa dicoba tanpa
 * perangkat fisik. Data ini sengaja berlabel "Demo" dan memakai integration
 * bertipe MQTT dengan externalId yang tidak mungkin ada di jaringan nyata,
 * sehingga tidak pernah muncul sebagai hasil scan.
 *
 * Jalankan: pnpm db:seed:demo   (hapus lagi: pnpm db:seed:demo:reset)
 */
const prisma = new PrismaClient();

const DEMO_PREFIX = 'demo';

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'owner@nexahome.local' },
    include: { ownedHomes: true },
  });
  if (!user) {
    throw new Error('Jalankan `pnpm db:seed` dulu untuk membuat akun owner.');
  }
  const home = user.ownedHomes[0];
  if (!home) throw new Error('Home untuk owner tidak ditemukan.');

  const room = await prisma.room.findFirst({
    where: { homeId: home.id, name: 'Ruang Tamu' },
  });

  // externalId berawalan "demo-" tidak mungkin diumumkan perangkat sungguhan.
  const devices = [
    {
      id: `${DEMO_PREFIX}_living_light`,
      name: 'Lampu Ruang Tamu (Demo)',
      type: 'light',
      roomId: room?.id ?? null,
      externalId: 'demo-living-light',
      capabilities: ['power', 'brightness'],
      state: { power: true, brightness: 80 },
    },
    {
      id: `${DEMO_PREFIX}_bedroom_light`,
      name: 'Lampu Kamar (Demo)',
      type: 'light',
      roomId: null,
      externalId: 'demo-bedroom-light',
      capabilities: ['power', 'brightness'],
      state: { power: false, brightness: 40 },
    },
  ];

  for (const d of devices) {
    await prisma.device.upsert({
      where: { id: d.id },
      update: { name: d.name, state: d.state },
      create: { ...d, homeId: home.id, integrationId: null },
    });
  }

  const scene = await prisma.scene.upsert({
    where: { id: `${DEMO_PREFIX}_scene_movie_night` },
    update: {},
    create: { id: `${DEMO_PREFIX}_scene_movie_night`, name: 'Movie Night', homeId: home.id },
  });
  await prisma.sceneAction.upsert({
    where: { id: `${DEMO_PREFIX}_scene_action_dim` },
    update: {},
    create: {
      id: `${DEMO_PREFIX}_scene_action_dim`,
      sceneId: scene.id,
      deviceId: devices[0].id,
      action: { action: 'set_brightness', value: 20 },
    },
  });
  await prisma.sceneAction.upsert({
    where: { id: `${DEMO_PREFIX}_scene_action_off` },
    update: {},
    create: {
      id: `${DEMO_PREFIX}_scene_action_off`,
      sceneId: scene.id,
      deviceId: devices[1].id,
      action: { action: 'turn_off' },
    },
  });

  const automation = await prisma.automation.upsert({
    where: { id: `${DEMO_PREFIX}_automation_morning` },
    update: {},
    create: {
      id: `${DEMO_PREFIX}_automation_morning`,
      name: 'Lampu Pagi 07:00 (Demo)',
      homeId: home.id,
      enabled: true,
    },
  });
  await prisma.automationTrigger.upsert({
    where: { id: `${DEMO_PREFIX}_trigger_morning` },
    update: {},
    create: {
      id: `${DEMO_PREFIX}_trigger_morning`,
      automationId: automation.id,
      type: 'SCHEDULE',
      config: { time: '07:00' },
    },
  });
  await prisma.automationAction.upsert({
    where: { id: `${DEMO_PREFIX}_action_morning_on` },
    update: {},
    create: {
      id: `${DEMO_PREFIX}_action_morning_on`,
      automationId: automation.id,
      deviceId: devices[0].id,
      action: { action: 'turn_on' },
    },
  });

  console.log(
    `✅ Seed demo selesai: ${devices.length} perangkat (label "Demo"), ` +
      '1 scene, 1 otomasi. Hapus dengan `pnpm db:seed:demo:reset`.',
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
