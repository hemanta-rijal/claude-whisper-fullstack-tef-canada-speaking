import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { startAttemptSchema, finishAttemptSchema } from '../schemas/attempt.schemas.js';
import {
  getScenarioPreviewController,
  startAttemptController,
  processTurnController,
  streamTurnController,
  finishAttemptController,
  getRecentResultsController,
  getResultsPagedController,
  getResultByIdController,
} from '../controllers/attempt.controller.js';

// multer disk storage — saves uploaded audio to /tmp with its original extension.
// LEARN: disk storage is used instead of memory storage so Whisper can stream the file.
// Memory storage would load the entire audio into RAM, which is wasteful for audio files.
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, '/tmp'),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max — Whisper's API limit
});

export const attemptRouter = Router();

// All attempt routes require a valid session
attemptRouter.use(requireAuth);

// GET /preview must be registered before /:id routes to avoid Express matching 'preview' as an id
attemptRouter.get('/preview', getScenarioPreviewController);

attemptRouter.post('/start', validate(startAttemptSchema), startAttemptController);

// upload.single('audio') runs before the controller — parses the multipart body
// and puts the file at req.file. Field name must be 'audio'.
attemptRouter.post('/:id/turn', upload.single('audio'), processTurnController);

// Streaming version — responds with Server-Sent Events instead of JSON.
// The frontend uses this; /turn is kept for Postman testing.
attemptRouter.post('/:id/turn-stream', upload.single('audio'), streamTurnController);

attemptRouter.post('/:id/finish', validate(finishAttemptSchema), finishAttemptController);

// LEARN: register static paths before `/results/:id` so "recent" and "paged" are not parsed as ids.
attemptRouter.get('/results/recent', getRecentResultsController);
attemptRouter.get('/results/paged', getResultsPagedController);
attemptRouter.get('/results/:id', getResultByIdController);