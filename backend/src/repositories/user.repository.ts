import { prisma } from '../lib/prisma.js';

// Repository layer: DB access only (Prisma queries).
export const userRepository = {
  async findByEmail(email: string): Promise<{ id: string; passwordHash: string | null } | null> {
    // Prisma -> SQL-ish: SELECT id, passwordHash FROM User WHERE email = ? LIMIT 1;
    return prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
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
    // Prisma -> SQL-ish: INSERT INTO User (email, name, passwordHash) VALUES (?, ?, ?);
    return prisma.user.create({
      data: input,
      select: { id: true }, // only return the id — service needs it to create a session
    });
  }
};


