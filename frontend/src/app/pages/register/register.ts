import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  private auth = inject(AuthService);

  name = signal('');
  email = signal('');
  password = signal('');
  error = signal('');
  loading = signal(false);

  async onSubmit() {
    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.register(this.email(), this.password(), this.name());
    } catch (err) {
      // LEARN: Angular's HttpClient wraps HTTP errors in HttpErrorResponse.
      // err.status is the actual HTTP status code the server sent back.
      // err.error.error is the { error: '...' } body we return from Express.
      if (err instanceof HttpErrorResponse) {
        if (err.status === 409) {
          this.error.set('This email is already registered. Try logging in instead.');
        } else if (err.status === 0) {
          this.error.set('Cannot reach the server. Check your connection.');
        } else {
          this.error.set(err.error?.error ?? 'Something went wrong. Please try again.');
        }
      } else {
        this.error.set('Something went wrong. Please try again.');
      }
    } finally {
      this.loading.set(false);
    }
  }
}
