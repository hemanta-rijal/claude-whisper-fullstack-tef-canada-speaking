import bcrypt from 'bcryptjs';
import { userRepository } from '../repositories/user.repository.js';
import { sessionRepository } from '../repositories/session.repository.js';

// Service layer: business logic (no Express req/res here).
export const authService = {
  async loginWithPassword(input: { email?: string; password?: string }): Promise<{ userId: string; sessionId: string }> {
    const email = input.email ?? '';
    const password = input.password ?? '';
    
    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new Error("Invalid email or password");
    }
    if (!user.passwordHash) {
      throw new Error("Password login not enabled for this user");
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new Error("Invalid email or password");
    }
    // TODO: decide expiry duration and create a session row in DB

    const session = await sessionRepository.createForUser(user.id);
    return { userId: user.id, sessionId: session.id };
  },
  async registerWithPassword(input: RegisterInput): Promise<{ userId: string; sessionId: string }> {
    const email = input.email ?? '';
    const password = input.password ?? '';
    const name = input.name;

    //check exist 
    const user = await userRepository.findByEmail(email);
    if (user) {
      throw new Error("User account has already been created")
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const newUser = await userRepository.createUser(
      {
        email: email,
        passwordHash: passwordHash,
        name: name
      })

    const session = await sessionRepository.createForUser(newUser.id);
    return { userId: newUser.id, sessionId: session.id };
  }


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

