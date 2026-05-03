import bcrypt from 'bcryptjs';
import { userRepository } from '../repositories/user.repository.js';
import { sessionRepository } from '../repositories/session.repository.js';
import { passwordResetRepository } from '../repositories/password-reset.repository.js';
import { emailVerificationRepository } from '../repositories/email-verification.repository.js';
import { emailService } from './email.service.js';
import { AppError } from '../lib/errors.js';

// Service layer: business logic (no Express req/res here).
export const authService = {
  async loginWithPassword(input: { email?: string; password?: string }): Promise<{ userId: string; sessionId: string }> {
    const email = input.email ?? '';
    const password = input.password ?? '';

    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new AppError(401, 'Invalid email or password');
    }
    if (!user.passwordHash) {
      throw new AppError(401, 'Password login not enabled for this account');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new AppError(401, 'Invalid email or password');
    }
    if (!user.emailVerifiedAt) {
      throw new AppError(403, 'Please verify your email address before signing in');
    }

    const session = await sessionRepository.createForUser(user.id);
    return { userId: user.id, sessionId: session.id };
  },

  async registerWithPassword(input: RegisterInput): Promise<{ userId: string }> {
    const email = input.email ?? '';
    const password = input.password ?? '';
    const name = input.name;
    const appUrl = process.env.APP_URL ?? 'http://localhost:4200';

    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new AppError(409, 'Email already in use');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const newUser = await userRepository.createUser({ email, passwordHash, name });

    const rawToken = await emailVerificationRepository.createToken(newUser.id);
    const verifyUrl = `${appUrl}/verify-email?token=${rawToken}`;
    await emailService.sendEmailVerification(email, verifyUrl);

    return { userId: newUser.id };
  },

  async verifyEmail(rawToken: string): Promise<{ userId: string; sessionId: string }> {
    const record = await emailVerificationRepository.findValidToken(rawToken);
    if (!record) {
      throw new AppError(400, 'Invalid or expired verification link');
    }

    await userRepository.setEmailVerified(record.userId);
    await emailVerificationRepository.deleteToken(record.id);
    const session = await sessionRepository.createForUser(record.userId);
    return { userId: record.userId, sessionId: session.id };
  },

  async forgotPassword(email: string): Promise<void> {
    const appUrl = process.env.APP_URL ?? 'http://localhost:4200';
    const user = await userRepository.findByEmail(email);

    // Always respond success — never reveal whether the email exists.
    if (!user) return;

    const rawToken = await passwordResetRepository.createToken(user.id);
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
    await emailService.sendPasswordReset(email, resetUrl);
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await passwordResetRepository.findValidToken(token);
    if (!record) {
      throw new AppError(400, 'Invalid or expired reset link');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await userRepository.updatePassword(record.userId, passwordHash);
    await passwordResetRepository.markUsed(record.id);
    await sessionRepository.revokeAllForUser(record.userId);
  },
};

export type RegisterInput = {
  email?: string,
  name?: string,
  password?: string
}

export type LoginInput = {
  email?: string,
  password?: string
}

