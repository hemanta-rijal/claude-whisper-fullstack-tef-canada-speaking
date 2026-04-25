import type { Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { userRepository } from '../repositories/user.repository.js';

const SESSION_COOKIE = 'sid';

const COOKIE_OPTIONS = {
  httpOnly: true,   // JS in the browser cannot read this cookie (protects against XSS token theft)
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production; plain HTTP ok in dev
  sameSite: 'lax' as const,  // Prevents most CSRF attacks; 'strict' is stronger but breaks OAuth redirects
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

export async function loginController(req: Request, res: Response): Promise<void> {
  // TODO: add Zod validation here to give proper 400 errors for missing/invalid fields.
  const { email, password } = req.body as { email?: string; password?: string };

  const result = await authService.loginWithPassword({ email, password });
  res.cookie(SESSION_COOKIE, result.sessionId, COOKIE_OPTIONS);
  res.status(200).json({ ok: true, userId: result.userId });
}

// GET /auth/me — protected route (requires valid session cookie)
// `req.user` is attached by `requireAuth` middleware before this runs.
export async function meController(req: Request, res: Response): Promise<void> {
  const user = await userRepository.findById(req.user!.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  // Never return passwordHash or session ids.
  res.status(200).json({ id: user.id, email: user.email, name: user.name });
}

export async function logoutController(req: Request, res: Response): Promise<void> {
  // Express-specific: cookies are in `req.cookies` but only after `cookie-parser` middleware is added.
  // TODO: install + register `cookie-parser` in server.ts, then read `req.cookies[SESSION_COOKIE]`.
  // TODO: call sessionRepository.revokeById(sessionId) to invalidate the DB session row.

  // Clear the cookie: must use same name + path so browser actually removes it.
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(200).json({ ok: true });
}

