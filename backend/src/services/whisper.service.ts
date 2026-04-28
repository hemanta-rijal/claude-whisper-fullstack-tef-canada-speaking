import fs from 'fs';
import OpenAI from 'openai';
import { getEnv } from '../lib/env.js';
import {
  buildDeliverySnapshotFromVerbose,
  type DeliverySnapshot,
} from './delivery-metrics.js';

// Initialise the OpenAI client once — reused across all requests.
// LEARN: this is the singleton pattern — one shared instance instead of creating a new one per request.
const openai = new OpenAI({ apiKey: getEnv().openAiApiKey });

export type TranscriptionResult = {
  /** Plain transcript shown in the UI and sent to the examiner. */
  text: string;
  /** Timed ASR metrics for end-of-test grading (fluency / pauses). */
  delivery: DeliverySnapshot;
};

/**
 * Transcribes an audio file to French text using OpenAI Whisper.
 *
 * @param filePath - absolute path to the audio file saved by multer
 * @param scenarioHint - a short French phrase describing the call context.
 *   Whisper uses this as a vocabulary/context primer — it dramatically improves
 *   accuracy for domain-specific words (club names, services, French phone phrases).
 * @returns text + delivery metrics, or null if the audio was silent/empty
 */
export async function transcribeAudio(
  filePath: string,
  scenarioHint?: string,
): Promise<TranscriptionResult | null> {
  try {
    // Guard 1: skip the API call entirely if the file is too small to contain real speech.
    // A webm container with 1–2 seconds of actual speech is at least 8–10KB.
    // Anything under 4KB is almost certainly silence or a fraction-of-a-second noise burst.
    // Sending silence to Whisper is what causes it to hallucinate English phrases.
    const { size } = fs.statSync(filePath);
    if (size < 4096) return null;

    // LEARN: `verbose_json` returns `text`, `duration`, and `segments` with timestamps —
    // we use those gaps to estimate pauses for grading (coherence / fluency).
    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-1',
      language: 'fr',
      response_format: 'verbose_json',
      prompt: scenarioHint
        ?? "Conversation téléphonique en français. L'appelant pose des questions à un interlocuteur professionnel.",
    });

    const verbose = response as unknown as {
      text?: string;
      duration?: number;
      segments?: Array<{ start: number; end: number }>;
    };

    const transcript = (verbose.text ?? '').trim();

    // Whisper sometimes returns empty string, just punctuation, or filler like "..."
    // for near-silent audio. Treat anything under 3 meaningful characters as empty
    // so we don't send noise to Claude.
    const meaningful = transcript.replace(/[.,!?…\s]/g, '');
    if (meaningful.length < 3) return null;

    const delivery = buildDeliverySnapshotFromVerbose(verbose);

    return { text: transcript, delivery };
  } finally {
    fs.unlink(filePath, () => {});
  }
}
