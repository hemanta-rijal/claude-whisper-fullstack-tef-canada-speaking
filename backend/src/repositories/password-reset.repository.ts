import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma.js';

const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export const passwordResetRepository = {
  async createToken(userId: string): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

    await prisma.passwordResetToken.deleteMany({ where: { userId } });

    await prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return raw;
  },

  async findValidToken(raw: string): Promise<{ id: string; userId: string } | null> {
    const tokenHash = hashToken(raw);
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (!record) return null;
    if (record.usedAt) return null;
    if (record.expiresAt < new Date()) return null;

    return { id: record.id, userId: record.userId };
  },

  async markUsed(id: string): Promise<void> {
    await prisma.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  },
};
