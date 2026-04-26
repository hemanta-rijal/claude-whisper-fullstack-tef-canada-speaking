import OpenAI from 'openai';
import { getEnv } from '../lib/env.js';

const openai = new OpenAI({ apiKey: getEnv().openAiApiKey });

/**
 * Converts French text to speech using OpenAI TTS.
 * Returns a Buffer of MP3 audio data — sent directly to the frontend.
 *
 * Model: 'gpt-4o-mini-tts' — newer than tts-1, faster, better quality, cheaper ($12/1M vs $15).
 *   Key advantage: accepts an `instructions` field so we can specify accent, tone, and register
 *   in plain language. This is not available on tts-1 or tts-1-hd.
 *
 * Voice: 'coral' — warm, clear, female. Works well for French customer service.
 *   LEARN: other voices available on gpt-4o-mini-tts include nova (bright), shimmer (soft),
 *   alloy (neutral), marin (French-sounding), ash, ballad, fable, onyx, sage, verse, cedar.
 */
export async function textToSpeech(text: string): Promise<Buffer> {
  const response = await openai.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: 'coral',
    input: text,
    response_format: 'mp3',
    speed: 1.15,
    // LEARN: 'instructions' is a gpt-4o-mini-tts feature — natural language prompt that controls
    // accent, tone, and delivery style. Not available on tts-1 or tts-1-hd.
    instructions: 'Parle en français avec un accent français naturel. Ton chaleureux et professionnel, comme une préposée au service à la clientèle. Parle clairement et à un rythme naturel.',
  });

  // The OpenAI SDK returns a Response object — convert to Buffer for Express to send as binary.
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
