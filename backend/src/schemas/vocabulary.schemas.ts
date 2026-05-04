import { z } from 'zod';

/** Body for POST /vocabulary/build — one word or short expression (TEF écrit prep). */
export const vocabularyBuildRequestSchema = z.object({
  expression: z.string().trim().min(1).max(200),
});

export type VocabularyBuildRequestBody = z.infer<typeof vocabularyBuildRequestSchema>;

/** One related lemma in the “famille de mots” (validated after model returns JSON). */
export const vocabularyFamilleMemberSchema = z.object({
  w: z.string(),
  p: z.string(),
  /** Short English gloss or translation of `w`. */
  wEn: z.string(),
  /** English grammatical category matching `p` (e.g. verb, noun). */
  pEn: z.string(),
});

/** Shape returned by the model and echoed by our API — matches the service-level prompt. */
export const vocabularyBuildResultSchema = z.object({
  word: z.string(),
  /** Concise English equivalent or gloss of `word`. */
  wordEn: z.string(),
  pos: z.string(),
  /** English POS label matching `pos`. */
  posEn: z.string(),
  fd: z.string(),
  /** Natural English translation of `fd` (same meaning and register tone where possible). */
  fdEn: z.string(),
  diss: z.string(),
  /** Natural English translation of `diss`. */
  dissEn: z.string(),
  famille: z.array(vocabularyFamilleMemberSchema).min(3).max(6),
});

export type VocabularyBuildResult = z.infer<typeof vocabularyBuildResultSchema>;
