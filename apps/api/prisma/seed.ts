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

  // eslint-disable-next-line no-console
  console.log(
    `✅ Seed selesai. Login: ${user.email} / password123 (home: ${home.name})`,
  );
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
