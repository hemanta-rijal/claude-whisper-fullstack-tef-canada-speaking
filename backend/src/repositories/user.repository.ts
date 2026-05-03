import { prisma } from '../lib/prisma.js';

// Repository layer: DB access only (Prisma queries).
export const userRepository = {
  async findByEmail(email: string): Promise<{ id: string; passwordHash: string | null; emailVerifiedAt: Date | null } | null> {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, emailVerifiedAt: true },
    });
  },

  async findById(id: string): Promise<{ id: string; email: string | null; name: string | null } | null> {
    // Prisma -> SQL-ish: SELECT id, email, name FROM User WHERE id = ? LIMIT 1;
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true },
    });
  },

  async createUser(input: { email: string; name?: string; passwordHash: string }): Promise<{ id: string }> {
    return prisma.user.create({
      data: input,
      select: { id: true },
    });
  },

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  },

  async setEmailVerified(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
  },
};


