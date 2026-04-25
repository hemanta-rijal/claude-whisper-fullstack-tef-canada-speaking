// Must be first: loads `backend/.env` into `process.env` before Prisma reads `DATABASE_URL`.
import '../src/bootstrapEnv.js';

import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';

// One-off script: upserts a local dev `User` with a real bcrypt hash in `passwordHash`.
// Prisma maps `prisma.user.upsert(...)` to SQL: INSERT ... ON DUPLICATE KEY UPDATE ... (MySQL-ish behavior via Prisma)
async function main(): Promise<void> {
  const email = process.env.SEED_DEV_EMAIL;
  const plainPassword = process.env.SEED_DEV_PASSWORD;

  if (!email) {
    throw new Error('Missing SEED_DEV_EMAIL (set it in backend/.env)');
  }
  if (!plainPassword) {
    throw new Error('Missing SEED_DEV_PASSWORD (set it in backend/.env)');
  }

  // bcrypt-specific: `saltRounds` controls how expensive hashing is (bigger = slower & harder to brute-force).
  // 12 is a common starting point for dev; tune with your security requirements later.
  const saltRounds = 12;
  // Name this `hashedPassword` (not `passwordHash`) to avoid any TS/name-shadowing confusion in editors.
  const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);

  const user = await prisma.user.upsert({
    // `where` must hit a unique field — `email` is @unique in your Prisma schema.
    where: { email },
    create: {
      email,
      passwordHash: hashedPassword,
    },
    update: {
      // If you re-run seeding, just refresh the hash (useful if you change SEED_DEV_PASSWORD)
      passwordHash: hashedPassword,
    },
    // `select` limits what Prisma returns (avoid selecting/logging `passwordHash`)
    select: { id: true, email: true },
  });

  // `user.id` is the app-level "userId" for that row.
  console.log(`upserted userId=${user.id} email=${user.email} (password hash written)`);

  // Prisma: always disconnect in one-off scripts so the process can exit cleanly.
  await prisma.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
