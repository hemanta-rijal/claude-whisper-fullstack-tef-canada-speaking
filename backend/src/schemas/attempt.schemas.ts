import { z } from 'zod';

export const startAttemptSchema = z.object({
  section: z.enum(['A', 'B']),
  scenarioId: z.string().optional(), // if present, pins the exam to the previewed scenario
});

const turnSchema = z.object({
  role: z.enum(['examiner', 'candidate']),
  content: z.string().min(1),
});

export const finishAttemptSchema = z.object({
  history: z.array(turnSchema).min(1),
  sections: z.array(z.enum(['A', 'B'])).min(1),
  scenarioId: z.string().min(1),
  reason: z.enum(['timeout', 'user_terminated']),
});

// Turn endpoint is multipart (audio file + form fields) — validated manually in the controller.
// Zod can't parse multipart bodies directly, so we export the turn schema for manual use.
export const turnBodySchema = z.object({
  history: z.string().min(1),    // JSON string — parsed manually from form field
  section: z.enum(['A', 'B']),
  scenarioId: z.string().min(1),
});
