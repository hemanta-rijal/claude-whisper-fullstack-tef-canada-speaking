import { Router } from 'express';
import { loginController, logoutController, meController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

// Router layer: thin wiring only (no business logic).
export const authRouter = Router();

authRouter.post('/login', loginController);
authRouter.post('/logout', logoutController);

// `requireAuth` runs first — if cookie is missing/invalid, it responds 401 and stops here.
// Only if `requireAuth` calls `next()` does `meController` run.
authRouter.get('/me', requireAuth, meController);

