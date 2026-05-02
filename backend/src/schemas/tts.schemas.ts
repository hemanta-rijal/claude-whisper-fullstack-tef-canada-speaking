import { z } from 'zod';

/** Body for POST /tts — short phrases only to limit API cost and latency. */
export const ttsRequestSchema = z.object({
  text: z.string().trim().min(1).max(500),
  lang: z.enum(['fr', 'en']).default('fr'),
});

export type TtsRequestBody = z.infer<typeof ttsRequestSchema>;
