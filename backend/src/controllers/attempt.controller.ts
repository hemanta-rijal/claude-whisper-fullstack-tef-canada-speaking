import type { Request, Response } from 'express';
import {
  startAttempt,
  getScenarioPreview,
  processTurn,
  streamTurn,
  finishAttempt,
  type Turn,
} from '../services/attempt.service.js';
import { resultRepository } from '../repositories/result.repository.js';
import { turnBodySchema } from '../schemas/attempt.schemas.js';

// Converts a Buffer of MP3 bytes to a base64 string.
// LEARN: base64 is how you safely embed binary data (audio, images) inside a JSON response.
function audioToBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

// GET /attempts/preview?section=A
// Returns the scenario image URL and ID — no AI calls, instant response.
// The frontend fetches this before the exam starts so the card is visible while the user reads it.
export function getScenarioPreviewController(req: Request, res: Response): void {
  const section = req.query.section as string;
  if (section !== 'A' && section !== 'B') {
    res.status(400).json({ error: 'Query param "section" must be A or B' });
    return;
  }
  const preview = getScenarioPreview(section as 'A' | 'B');
  res.status(200).json(preview);
}

// POST /attempts/start
// Body: { section: 'A' | 'B', scenarioId?: string }
// Accepts optional scenarioId to pin to the scenario already shown in the preview.
// Returns: scenario image URL + opening line text + opening audio (base64 MP3)
export async function startAttemptController(req: Request, res: Response): Promise<void> {
  const { section, scenarioId } = req.body as { section: 'A' | 'B'; scenarioId?: string };

  const result = await startAttempt(section, scenarioId);

  res.status(200).json({
    attemptId: result.attemptId,
    section: result.section,
    scenarioId: result.scenarioId,
    scenarioImageUrl: result.scenarioImageUrl,
    openingText: result.openingText,
    openingAudio: audioToBase64(result.openingAudio),
  });
}

// POST /attempts/:id/turn
// Multipart form: audio file (field name: 'audio') + form fields: history, section, scenarioId
// Returns: transcript + examiner response text + examiner audio (base64 MP3)
export async function processTurnController(req: Request, res: Response): Promise<void> {
  // multer puts the uploaded file on req.file — validate it exists
  if (!req.file) {
    res.status(400).json({ error: 'Audio file is required' });
    return;
  }

  // Validate the form fields with Zod
  const parsed = turnBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Validation failed',
      issues: parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
    });
    return;
  }

  // history arrives as a JSON string in a multipart form field — parse it back to an array
  let history: Turn[];
  try {
    history = JSON.parse(parsed.data.history) as Turn[];
  } catch {
    res.status(400).json({ error: 'history must be a valid JSON array' });
    return;
  }

  const result = await processTurn(
    req.file.path,           // absolute path to the temp audio file multer saved
    history,
    parsed.data.section,
    parsed.data.scenarioId,
  );

  // If skipped, send empty fields — frontend will restart listening without touching history
  res.status(200).json({
    skipped: result.skipped,
    transcript: result.transcript,
    examinerText: result.examinerText,
    examinerAudio: result.skipped ? '' : audioToBase64(result.examinerAudio),
  });
}

// POST /attempts/:id/turn-stream
// Same multipart input as /turn, but responds with Server-Sent Events (SSE) instead of JSON.
//
// SSE is a simple HTTP streaming protocol: the connection stays open and the server writes
// "event: <name>\ndata: <json>\n\n" chunks as they become ready. The browser reads them
// one by one through a ReadableStream.
//
// Event sequence the client should expect:
//   1. "transcript"  — candidate's speech text (arrives after Whisper)
//   2. "audio"       — one TTS sentence chunk (repeated, one per examiner sentence)
//   3. "done"        — stream complete, client can start listening again
//   (or "skipped"   — Whisper returned empty, client should restart listening immediately)
export async function streamTurnController(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ error: 'Audio file is required' });
    return;
  }

  const parsed = turnBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Validation failed',
      issues: parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
    });
    return;
  }

  let history: Turn[];
  try {
    history = JSON.parse(parsed.data.history) as Turn[];
  } catch {
    res.status(400).json({ error: 'history must be a valid JSON array' });
    return;
  }

  // ── SSE headers ────────────────────────────────────────────────────────────
  // Content-Type: text/event-stream  tells the browser this is an SSE stream.
  // Cache-Control: no-cache          prevents any proxy from buffering the response.
  // X-Accel-Buffering: no            disables nginx proxy buffering (important in production).
  // flushHeaders() sends the headers immediately, opening the stream.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Helper that writes one SSE event to the response.
  // LEARN: SSE format is strictly: "event: name\ndata: json\n\n" (double newline = end of event)
  const emit = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // streamTurn() is an AsyncGenerator — we iterate it with for-await.
    // Each iteration yields one event (transcript, audio, skipped, done).
    // We write it to the SSE stream immediately as it arrives.
    for await (const event of streamTurn(
      req.file.path,
      history,
      parsed.data.section,
      parsed.data.scenarioId,
    )) {
      switch (event.type) {
        case 'skipped':
          emit('skipped', {});
          break;
        case 'transcript':
          emit('transcript', { text: event.text });
          break;
        case 'audio':
          emit('audio', { sentenceText: event.sentenceText, base64: event.base64 });
          break;
        case 'done':
          emit('done', {});
          break;
      }
    }
  } catch (err) {
    // Best-effort error event — the client may or may not receive it depending on
    // where in the stream the error occurred.
    emit('error', { message: 'Processing failed' });
  } finally {
    // Always close the HTTP response so the client's ReadableStream gets `done: true`.
    res.end();
  }
}

// POST /attempts/:id/finish
// Body: { history, sections, scenarioId, reason }
// Returns: closing line text + audio + full evaluation scores
export async function finishAttemptController(req: Request, res: Response): Promise<void> {
  const { history, sections, scenarioId, reason } = req.body as {
    history: Turn[];
    sections: ('A' | 'B')[];
    scenarioId: string;
    reason: 'timeout' | 'user_terminated';
  };

  const result = await finishAttempt(
    req.user!.id,   // from requireAuth middleware
    history,
    sections,
    scenarioId,
    reason,
  );

  res.status(200).json({
    closingText: result.closingText,
    closingAudio: audioToBase64(result.closingAudio),
    evaluation: result.evaluation,
  });
}

// GET /results
// Returns all past test results for the logged-in user
export async function getResultsController(req: Request, res: Response): Promise<void> {
  const results = await resultRepository.findAllByUser(req.user!.id);
  res.status(200).json(results);
}

// GET /results/:id
// Returns one result — scoped to the logged-in user
export async function getResultByIdController(req: Request, res: Response): Promise<void> {
  const result = await resultRepository.findById(String(req.params.id), req.user!.id);
  if (!result) {
    res.status(404).json({ error: 'Result not found' });
    return;
  }
  res.status(200).json(result);
}
