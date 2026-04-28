import { z } from 'zod';

/** Coerces API/LLM oddities ("null" string, missing) into number | null for DB. */
const nullableScore = z.preprocess((val: unknown) => {
  if (val === null || val === undefined || val === 'null' || val === '') return null;
  const n = typeof val === 'string' ? Number.parseFloat(val) : Number(val);
  return Number.isFinite(n) ? n : null;
}, z.number().nullable());

// LEARN: Validates Claude's JSON so a slightly wrong shape does not crash saveTransaction.
export const evaluationResultSchema = z.object({
  cefrLevel: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  overallScore: z.coerce.number(),
  sectionAScore: nullableScore,
  sectionBScore: nullableScore,
  lexicalRichness: z.coerce.number(),
  taskFulfillment: z.coerce.number(),
  grammar: z.coerce.number(),
  coherence: z.coerce.number(),
  feedback: z.string(),
  suggestions: z.string(),
});

export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
