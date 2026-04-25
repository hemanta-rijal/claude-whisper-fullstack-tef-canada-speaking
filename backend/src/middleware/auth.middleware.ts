import type { NextFunction, Request, Response } from 'express';
import { sessionRepository } from '../repositories/session.repository.js';

// Extend Express's Request type so TypeScript knows `req.user` exists after this middleware runs.
// LEARN: "declaration merging" — how you safely add custom properties to Express types.
declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

const SESSION_COOKIE = 'sid';


export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // cookie-parser populates `req.cookies` (it's a plain object of cookie name → value strings).
  const sessionId = req.cookies[SESSION_COOKIE] as string | undefined;

  if (!sessionId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  // DB lookup: check session exists, is not revoked, and has not expired.
  const session = await sessionRepository.findValidById(sessionId);

  if (!session) {
    res.status(401).json({ error: 'Session expired or invalid' });
    return;
  }

  // Attach user id to the request so controllers downstream can use it.
  req.user = { id: session.userId };

  // Express-specific: call `next()` to pass control to the next middleware/controller.
  next();
}

