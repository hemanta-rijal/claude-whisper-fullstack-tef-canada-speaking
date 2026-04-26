import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { authRouter } from './routes/auth.route.js';
import { attemptRouter } from './routes/attempt.route.js';
import { errorMiddleware } from './middleware/error.middleware.js';

// __dirname doesn't exist in ES modules — this recreates it
// LEARN: ES modules use import.meta.url instead of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const app = express();

// CORS: allow the Angular dev server to call this backend.
// `credentials: true` is required so the browser sends the session cookie cross-origin.
// LEARN: without this, the browser blocks all requests from localhost:4200 to localhost:3000.
app.use(cors({
  origin: 'http://localhost:4200',
  credentials: true,
}));

// Node/Express-specific: `express.json()` parses JSON request bodies and populates `req.body`.
app.use(express.json());
// cookie-parser: reads the raw `Cookie: sid=...` request header and populates `req.cookies`.
// Without this, `req.cookies` is undefined and your auth middleware can't read the session id.
app.use(cookieParser());

// Serve scenario images statically — accessible at /assets/scenarios/...
// express.static maps a URL prefix to a folder on disk
app.use('/assets', express.static(join(__dirname, 'assets')));

// Routes
app.use('/auth', authRouter);
app.use('/attempts', attemptRouter);

// Minimal "proof the wiring works" route.
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// Node/Express-specific: error middleware should be registered last.
app.use(errorMiddleware);