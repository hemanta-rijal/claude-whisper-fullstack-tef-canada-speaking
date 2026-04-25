import express, { type NextFunction, type Request, type Response } from 'express';

export const app = express();
// Node/Express-specific: `express.json()` parses JSON request bodies and populates `req.body`.
app.use(express.json());

// Minimal "proof the wiring works" route.
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// Node/Express-specific: error-handling middleware has 4 args: (err, req, res, next).
// Express only treats it as an error handler if you keep that 4-arg signature.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // TODO: add structured logging (what happened + where).
  // TODO: map known error types to proper status codes.
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});