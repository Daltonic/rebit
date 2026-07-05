import { prisma } from '@/lib/prisma/client';

/**
 * Seeds initial users.
 * Only useful for local dev — production users authenticate via Google/GitHub OAuth.
 * Run with: npx tsx lib/auth/seed.ts
 */
async function seed() {
  const email = process.env.SEED_EMAIL || 'admin@rebit.local';
  const name = process.env.SEED_NAME || 'Admin';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User "${email}" already exists.`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
    },
  });

  console.log(`Created user: ${user.email} (${user.name})`);
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());