import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

type CreateResultInput = {
  userId: string;
  sections: string;
  cefrLevel: string | null;
  overallScore: number;
  sectionAScore: number | null;
  sectionBScore: number | null;
  lexicalRichness: number;
  taskFulfillment: number;
  grammar: number;
  coherence: number;
  feedback: string;
  suggestions: string;
  reason: string;
  deliverySummary?: Prisma.InputJsonValue;
};

export const resultRepository = {
  async create(input: CreateResultInput) {
    // Prisma -> SQL: INSERT INTO TestResult (...) VALUES (...)
    const { deliverySummary, ...rest } = input;
    return prisma.testResult.create({
      data: {
        ...rest,
        ...(deliverySummary !== undefined ? { deliverySummary } : {}),
      },
    });
  },

  async findById(id: string, userId: string) {
    // Scoped to userId — a user can only read their own results
    return prisma.testResult.findFirst({
      where: { id, userId },
    });
  },

  /** Most recent attempts — dashboard. LEARN: `take` + `orderBy` = SQL LIMIT + ORDER BY DESC */
  async findRecentByUser(userId: string, limit: number) {
    return prisma.testResult.findMany({
      where: { userId },
      orderBy: { completedAt: 'desc' },
      take: limit,
    });
  },

  /**
   * Server-side pagination. LEARN: `skip` = (page-1)*pageSize; parallel `count` for total pages.
   */
  async findPagedByUser(userId: string, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      prisma.testResult.findMany({
        where: { userId },
        orderBy: { completedAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.testResult.count({ where: { userId } }),
    ]);
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    return { items, total, page, pageSize, totalPages };
  },
};
