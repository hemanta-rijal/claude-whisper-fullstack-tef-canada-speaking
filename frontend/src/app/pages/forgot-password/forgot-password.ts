import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-forgot-password',
  imports: [FormsModule, RouterLink],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPassword {
  private auth = inject(AuthService);

  email = signal('');
  loading = signal(false);
  sent = signal(false);
  error = signal('');

  async onSubmit() {
    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.forgotPassword(this.email());
      this.sent.set(true);
    } catch {
      this.error.set('Something went wrong. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
