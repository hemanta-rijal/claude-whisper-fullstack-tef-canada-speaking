import OpenAI from 'openai';
import { getEnv } from '../lib/env.js';

const openai = new OpenAI({ apiKey: getEnv().openAiApiKey });

export type TtsLang = 'fr' | 'en';

/**
 * Converts text to speech using OpenAI TTS.
 * Returns a Buffer of MP3 audio data — sent directly to the frontend.
 *
 * Model: 'gpt-4o-mini-tts' — accepts `instructions` for accent/register (not available on tts-1).
 * Voice: 'coral' — works for both FR and EN flashcard playback.
 *
 * LEARN: the Angular client caches MP3s in IndexedDB per text+lang; if you change model/voice/instructions in a material way,
 * bump the SCHEMA string in `frontend/.../tts-clip-cache.ts` so old blobs are not reused under the same key.
 */
export async function textToSpeech(text: string, lang: TtsLang = 'fr'): Promise<Buffer> {
  const instructions =
    lang === 'fr'
      ? 'Parle en français avec un accent français naturel. Ton clair et professionnel. Rythme naturel.'
      : 'Speak in clear English with a neutral accent suitable for language learners. Natural pace, friendly tutor tone.';

  const speed = lang === 'fr' ? 1.15 : 1.05;

  const response = await openai.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: 'coral',
    input: text,
    response_format: 'mp3',
    speed,
    instructions,
  });

  // The OpenAI SDK returns a Response object — convert to Buffer for Express to send as binary.
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
