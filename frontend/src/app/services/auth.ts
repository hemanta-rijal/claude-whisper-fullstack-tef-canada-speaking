import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

const API = environment.apiUrl;

export type User = { id: string; email: string; name: string | null };

@Injectable({ providedIn: 'root' })
export class AuthService {
  // LEARN: signal() is Angular's reactive primitive — like useState in React.
  // Components using this signal re-render automatically when it changes.
  readonly currentUser = signal<User | null>(null);
  readonly isLoading = signal(true);

  private http = inject(HttpClient);
  private router = inject(Router);

  // Called once on app startup — checks if the user already has a valid session.
  async init(): Promise<void> {
    try {
      const user = await firstValueFrom(this.http.get<User>(`${API}/auth/me`));
      this.currentUser.set(user);
    } catch {
      this.currentUser.set(null);
    } finally {
      this.isLoading.set(false);
    }
  }

  async login(email: string, password: string): Promise<void> {
    await firstValueFrom(this.http.post(`${API}/auth/login`, { email, password }));
    const user = await firstValueFrom(this.http.get<User>(`${API}/auth/me`));
    this.currentUser.set(user);
    this.router.navigate(['/dashboard']);
  }

  async register(email: string, password: string, name: string): Promise<void> {
    await firstValueFrom(this.http.post(`${API}/auth/register`, { email, password, name }));
  }

  async verifyEmail(token: string): Promise<void> {
    await firstValueFrom(this.http.get(`${API}/auth/verify-email`, { params: { token } }));
    const user = await firstValueFrom(this.http.get<User>(`${API}/auth/me`));
    this.currentUser.set(user);
    this.router.navigate(['/dashboard']);
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post(`${API}/auth/logout`, {}));
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  async forgotPassword(email: string): Promise<void> {
    await firstValueFrom(this.http.post(`${API}/auth/forgot-password`, { email }));
  }

  async resetPassword(token: string, password: string): Promise<void> {
    await firstValueFrom(this.http.post(`${API}/auth/reset-password`, { token, password }));
  }
}
