import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
    } catch {
      this.error.set('Registration failed. Email may already be in use.');
    } finally {
      this.loading.set(false);
    }
  }
}
