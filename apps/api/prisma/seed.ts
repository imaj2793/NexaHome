import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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

  const livingRoom = await prisma.room.findFirst({
    where: { homeId: home.id, name: 'Ruang Tamu' },
  });

  const wizIntegration = await prisma.integration.upsert({
    where: { id: 'integration_wiz' },
    update: {},
    create: {
      id: 'integration_wiz',
      name: 'WiZ',
      type: 'WIZ',
      homeId: home.id,
      config: { mode: 'mock' },
    },
  });

  const sampleDevices = [
    {
      id: 'device_living_light',
      name: 'Lampu Ruang Tamu',
      type: 'light',
      roomId: livingRoom?.id ?? null,
      integrationId: wizIntegration.id,
      externalId: 'wiz_aabbccddeeff',
      capabilities: ['power', 'brightness', 'color', 'temperature'],
      state: { power: true, brightness: 80 },
    },
    {
      id: 'device_bedroom_light',
      name: 'Lampu Kamar',
      type: 'light',
      roomId: null,
      integrationId: wizIntegration.id,
      externalId: 'wiz_112233445566',
      capabilities: ['power', 'brightness'],
      state: { power: false, brightness: 40 },
    },
  ];

  for (const d of sampleDevices) {
    await prisma.device.upsert({
      where: { id: d.id },
      update: { integrationId: d.integrationId, externalId: d.externalId },
      create: { ...d, homeId: home.id },
    });
  }

  // ── Scene: Movie Night ──
  const scene = await prisma.scene.upsert({
    where: { id: 'scene_movie_night' },
    update: {},
    create: { id: 'scene_movie_night', name: 'Movie Night', homeId: home.id },
  });
  await prisma.sceneAction.upsert({
    where: { id: 'scene_action_dim' },
    update: { sceneId: scene.id },
    create: {
      id: 'scene_action_dim',
      sceneId: scene.id,
      deviceId: 'device_living_light',
      action: { action: 'set_brightness', value: 20 },
    },
  });
  await prisma.sceneAction.upsert({
    where: { id: 'scene_action_bedroom_off' },
    update: { sceneId: scene.id },
    create: {
      id: 'scene_action_bedroom_off',
      sceneId: scene.id,
      deviceId: 'device_bedroom_light',
      action: { action: 'turn_off' },
    },
  });

  // ── Automation: jadwal pagi ──
  const automation = await prisma.automation.upsert({
    where: { id: 'automation_morning' },
    update: {},
    create: {
      id: 'automation_morning',
      name: 'Lampu Pagi 07:00',
      homeId: home.id,
      enabled: true,
    },
  });
  await prisma.automationTrigger.upsert({
    where: { id: 'trigger_morning' },
    update: { automationId: automation.id },
    create: {
      id: 'trigger_morning',
      automationId: automation.id,
      type: 'SCHEDULE',
      config: { time: '07:00' },
    },
  });
  await prisma.automationAction.upsert({
    where: { id: 'action_morning_on' },
    update: { automationId: automation.id },
    create: {
      id: 'action_morning_on',
      automationId: automation.id,
      deviceId: 'device_living_light',
      action: { action: 'turn_on' },
    },
  });

  // ── Notifikasi selamat datang ──
  await prisma.notification.upsert({
    where: { id: 'notif_welcome' },
    update: {},
    create: {
      id: 'notif_welcome',
      userId: user.id,
      title: 'Selamat datang di NexaHome',
      body: 'Scene & otomasi sudah siap. Coba ketik "aktifkan movie night" ke Nexa.',
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
