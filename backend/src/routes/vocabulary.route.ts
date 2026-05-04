import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { vocabularyBuildRequestSchema } from '../schemas/vocabulary.schemas.js';
import { postVocabularyBuildController } from '../controllers/vocabulary.controller.js';

export const vocabularyRouter = Router();

vocabularyRouter.use(requireAuth);

vocabularyRouter.post('/build', validate(vocabularyBuildRequestSchema), postVocabularyBuildController);
