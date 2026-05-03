import { Router } from 'express';
import {
  loginController,
  logoutController,
  meController,
  registerController,
  verifyEmailController,
  forgotPasswordController,
  resetPasswordController,
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { loginSchema, registerSchema, forgotPasswordSchema, resetPasswordSchema } from '../schemas/auth.schemas.js';

export const authRouter = Router();

authRouter.post('/login', validate(loginSchema), loginController);
authRouter.post('/logout', logoutController);
authRouter.post('/register', validate(registerSchema), registerController);
authRouter.get('/verify-email', verifyEmailController);
authRouter.post('/forgot-password', validate(forgotPasswordSchema), forgotPasswordController);
authRouter.post('/reset-password', validate(resetPasswordSchema), resetPasswordController);

authRouter.get('/me', requireAuth, meController);

