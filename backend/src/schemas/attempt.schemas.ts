import { z } from 'zod';

export const startAttemptSchema = z.object({
  section: z.enum(['A', 'B']),
  scenarioId: z.string().optional(), // if present, pins the exam to the previewed scenario
});

const turnSchema = z.object({
  role: z.enum(['examiner', 'candidate']),
  content: z.string().min(1),
});

// LEARN: Zod models Whisper-derived delivery metrics; fields are lenient (coerce / optional)
// so a slightly malformed client payload does not block grading.
const deliverySnapshotSchema = z.object({
  durationSec: z.coerce.number(),
  segmentCount: z.coerce.number(),
  speechDurationSec: z.coerce.number(),
  longestPauseSec: z.coerce.number(),
  wordsEstimate: z.coerce.number(),
  wordsPerMinute: z.union([z.number(), z.null()]).optional(),
});

export const finishAttemptSchema = z.object({
  history: z.array(turnSchema).min(1),
  sections: z.array(z.enum(['A', 'B'])).min(1),
  scenarioId: z.string().min(1),
  reason: z.enum(['timeout', 'user_terminated']),
  // One entry per candidate turn, same order as candidate messages in history (optional for old clients).
  candidateDelivery: z.array(deliverySnapshotSchema).optional(),
});

// Turn endpoint is multipart (audio file + form fields) — validated manually in the controller.
// Zod can't parse multipart bodies directly, so we export the turn schema for manual use.
export const turnBodySchema = z.object({
  history: z.string().min(1),    // JSON string — parsed manually from form field
  section: z.enum(['A', 'B']),
  scenarioId: z.string().min(1),
});
