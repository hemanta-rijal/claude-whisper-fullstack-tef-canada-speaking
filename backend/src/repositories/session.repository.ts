import { prisma } from '../lib/prisma.js';

// Repository layer: DB access only (Prisma queries).
export const sessionRepository = {
  async createForUser(userId: string): Promise<{ id: string }> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Prisma -> SQL-ish: INSERT INTO Session (...) VALUES (...);
    return prisma.session.create({
      data: { userId, expiresAt },
      select: { id: true },
    });
  },

  async findValidById(sessionId: string): Promise<{ userId: string } | null> {
    // Prisma -> SQL-ish: SELECT userId FROM Session WHERE id=? AND revokedAt IS NULL AND expiresAt > NOW()
    return prisma.session.findFirst({
      where: {
        id: sessionId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { userId: true },
    });
  },

  async revokeById(sessionId: string): Promise<void> {
    await prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },  // Prisma -> SQL-ish: UPDATE Session SET revokedAt=NOW() WHERE id=?
    });
  },
};
