import { Router } from 'express';
import { loginController, logoutController, meController, registerController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { loginSchema, registerSchema } from '../schemas/auth.schemas.js';

// Router layer: thin wiring only (no business logic).
export const authRouter = Router();

authRouter.post('/login', validate(loginSchema), loginController);
authRouter.post('/logout', logoutController);
authRouter.post('/register', validate(registerSchema), registerController)

// `requireAuth` runs first — if cookie is missing/invalid, it responds 401 and stops here.
// Only if `requireAuth` calls `next()` does `meController` run.
authRouter.get('/me', requireAuth, meController);

