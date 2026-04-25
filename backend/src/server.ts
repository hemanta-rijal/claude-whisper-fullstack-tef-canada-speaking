import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.route.js';
import { errorMiddleware } from './middleware/error.middleware.js';

export const app = express();
// Node/Express-specific: `express.json()` parses JSON request bodies and populates `req.body`.
app.use(express.json());
// cookie-parser: reads the raw `Cookie: sid=...` request header and populates `req.cookies`.
// Without this, `req.cookies` is undefined and your auth middleware can't read the session id.
app.use(cookieParser());

// Routes
app.use('/auth', authRouter);

// Minimal "proof the wiring works" route.
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// Node/Express-specific: error middleware should be registered last.
app.use(errorMiddleware);