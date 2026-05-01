import type { Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { userRepository } from '../repositories/user.repository.js';
import { sessionRepository } from '../repositories/session.repository.js';
import type { RegisterInput, LoginInput } from '../services/auth.service.js';
import { AppError } from '../lib/errors.js';

const SESSION_COOKIE = 'sid';

const COOKIE_OPTIONS = {
  httpOnly: true,
  // Set COOKIE_SECURE=true in production with HTTPS. Defaults to false so HTTP (e.g. Docker Compose) works.
  secure: process.env.COOKIE_SECURE === 'true',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

export async function loginController(req: Request, res: Response): Promise<void> {
  // TODO: add Zod validation here to give proper 400 errors for missing/invalid fields.
  //const { email, password } = req.body as { email?: string; password?: string };
  const { email, password } = (req.body ?? {}) as LoginInput;

  try {
    const result = await authService.loginWithPassword({ email, password });
    res.cookie(SESSION_COOKIE, result.sessionId, COOKIE_OPTIONS);
    res.status(200).json({ ok: true, userId: result.userId });
  } catch (err) {
    // AppError carries the exact status code decided by the service layer.
    // Anything else is an unexpected server failure — never expose its message externally.
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
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
  const sessionId = req.cookies[SESSION_COOKIE] as string | undefined;
  if(sessionId){
    await sessionRepository.revokeById(sessionId);
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(200).json({ ok: true });
}

export async function registerController(req: Request, res: Response): Promise<void>{
  const { email, name, password } = (req.body ?? {}) as RegisterInput;
  try {
    const result = await authService.registerWithPassword({ email, name, password });
    res.cookie(SESSION_COOKIE, result.sessionId, COOKIE_OPTIONS);
    res.status(201).json({ ok: true, userId: result.userId });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export async function forgotPasswordController(req: Request, res: Response): Promise<void> {
  const { email } = req.body as { email: string };
  try {
    await authService.forgotPassword(email);
    // Always 200 — never reveal whether the email exists.
    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function resetPasswordController(req: Request, res: Response): Promise<void> {
  const { token, password } = req.body as { token: string; password: string };
  try {
    await authService.resetPassword(token, password);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

