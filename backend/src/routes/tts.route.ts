import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { ttsRequestSchema } from '../schemas/tts.schemas.js';
import { postTtsController } from '../controllers/tts.controller.js';

export const ttsRouter = Router();

ttsRouter.use(requireAuth);

ttsRouter.post('/', validate(ttsRequestSchema), postTtsController);
