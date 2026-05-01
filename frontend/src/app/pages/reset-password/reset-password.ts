import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-reset-password',
  imports: [FormsModule, RouterLink],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword implements OnInit {
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  token = signal('');
  password = signal('');
  confirm = signal('');
  loading = signal(false);
  done = signal(false);
  error = signal('');

  ngOnInit() {
    const t = this.route.snapshot.queryParamMap.get('token') ?? '';
    this.token.set(t);
  }

  async onSubmit() {
    if (this.password() !== this.confirm()) {
      this.error.set('Passwords do not match.');
      return;
    }
    if (!this.token()) {
      this.error.set('Invalid reset link. Please request a new one.');
      return;
    }

    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.resetPassword(this.token(), this.password());
      this.done.set(true);
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 400) {
          this.error.set('This reset link is invalid or has expired. Please request a new one.');
        } else {
          this.error.set('Something went wrong. Please try again.');
        }
      } else {
        this.error.set('Something went wrong. Please try again.');
      }
    } finally {
      this.loading.set(false);
    }
  }
}
