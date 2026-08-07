import { PrismaClient, MemberRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@contenthub.local';
const ADMIN_PASSWORD = 'changeme';
const TEAM_NAME = 'Demo Team';

async function main() {
  const passwordHash = await argon2.hash(ADMIN_PASSWORD);

  // Idempotent: upsert admin user by unique email.
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { name: 'Admin', passwordHash, isActive: true },
    create: {
      email: ADMIN_EMAIL,
      name: 'Admin',
      passwordHash,
      role: 'OWNER',
      isActive: true,
    },
  });

  // Idempotent: upsert demo team by name.
  const team = await prisma.team.upsert({
    where: { id: 'seed-demo-team' },
    update: { name: TEAM_NAME, description: 'Seeded demonstration team' },
    create: {
      id: 'seed-demo-team',
      name: TEAM_NAME,
      description: 'Seeded demonstration team',
      ownerId: admin.id,
    },
  });

  // Idempotent: link admin to team as ADMIN member.
  await prisma.member.upsert({
    where: { teamId_userId: { teamId: team.id, userId: admin.id } },
    update: { role: MemberRole.ADMIN },
    create: { teamId: team.id, userId: admin.id, role: MemberRole.ADMIN },
  });

  console.log(`Seeded admin user: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`Seeded team: ${TEAM_NAME}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
