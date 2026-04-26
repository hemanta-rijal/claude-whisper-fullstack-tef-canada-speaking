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
};

export const resultRepository = {
  async create(input: CreateResultInput) {
    // Prisma -> SQL: INSERT INTO TestResult (...) VALUES (...)
    return prisma.testResult.create({ data: input });
  },

  async findAllByUser(userId: string) {
    // Prisma -> SQL: SELECT * FROM TestResult WHERE userId = ? ORDER BY completedAt DESC
    return prisma.testResult.findMany({
      where: { userId },
      orderBy: { completedAt: 'desc' },
    });
  },

  async findById(id: string, userId: string) {
    // Scoped to userId — a user can only read their own results
    return prisma.testResult.findFirst({
      where: { id, userId },
    });
  },
};
