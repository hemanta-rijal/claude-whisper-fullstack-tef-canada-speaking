import bcrypt from 'bcryptjs';
import { userRepository } from '../repositories/user.repository.js';
import { sessionRepository } from '../repositories/session.repository.js';

// Service layer: business logic (no Express req/res here).
export const authService = {
  async loginWithPassword(input: { email?: string; password?: string }): Promise<{ userId: string; sessionId: string }> {
    // TODO: validate with Zod and give good 400 errors
    const email = input.email ?? '';
    const password = input.password ?? '';


    const user = await userRepository.findByEmail(email);
    if (!user){
      throw new Error("Invalid email or password");
    }

    if(!user.passwordHash){
      throw new Error("Password login not enabled for this user");
    }

    const ok = await bcrypt.compare(password,user.passwordHash);
    if(!ok){
      throw new Error("Invalid email or password");
    }

    // TODO: decide expiry duration and create a session row in DB

    const session = await sessionRepository.createForUser(user.id);
    return  {userId: user.id , sessionId: session.id};
  },
};

