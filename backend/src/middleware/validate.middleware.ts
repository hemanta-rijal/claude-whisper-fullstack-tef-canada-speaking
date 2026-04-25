import type { NextFunction, Request, Response } from 'express';

// Placeholder validation middleware (Zod will plug in here later).
// TODO: introduce Zod schemas for each route's input and validate `req.body/req.params/req.query`.
export function validateMiddleware(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

