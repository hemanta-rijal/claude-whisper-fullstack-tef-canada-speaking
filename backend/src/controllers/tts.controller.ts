import type { Request, Response } from 'express';
import { textToSpeech } from '../services/tts.service.js';
import type { TtsRequestBody } from '../schemas/tts.schemas.js';

/**
 * POST /tts — authenticated users only; returns MP3 bytes for the flashcard player.
 * Route validates body with Zod before this runs (see validate(ttsRequestSchema)).
 */
export async function postTtsController(req: Request, res: Response): Promise<void> {
  const { text, lang } = req.body as TtsRequestBody;
  try {
    const mp3 = await textToSpeech(text, lang);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(mp3);
  } catch (err) {
    console.error('[tts]', err);
    res.status(502).json({ error: 'Text-to-speech failed' });
  }
}
