import type { Request, Response } from 'express';
import { buildVocabulary } from '../services/vocabulary-builder.service.js';
import type { VocabularyBuildRequestBody } from '../schemas/vocabulary.schemas.js';

/**
 * POST /vocabulary/build — authenticated; body validated by Zod upstream.
 * Returns structured phrases for TEF écrit Section A (fait divers) vs B (dissertation) + word family.
 */
export async function postVocabularyBuildController(req: Request, res: Response): Promise<void> {
  const { expression } = req.body as VocabularyBuildRequestBody;
  try {
    const result = await buildVocabulary(expression);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[vocabulary/build]', msg);
    if (msg.includes('ANTHROPIC_API_KEY')) {
      res.status(503).json({ error: 'Vocabulary builder is not configured (missing API key).' });
      return;
    }
    res.status(502).json({ error: 'Vocabulary generation failed. Try again.' });
  }
}
