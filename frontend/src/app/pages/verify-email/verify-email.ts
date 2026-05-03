import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-verify-email',
  imports: [RouterLink],
  templateUrl: './verify-email.html',
  styleUrl: './verify-email.scss',
})
export class VerifyEmail implements OnInit {
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  loading = signal(true);
  error = signal('');

  async ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';

    if (!token) {
      this.error.set('No verification token found. Please use the link from your email.');
      this.loading.set(false);
      return;
    }

    try {
      await this.auth.verifyEmail(token);
      // verifyEmail navigates to /dashboard on success
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 400) {
          this.error.set('This verification link is invalid or has expired. Please register again.');
        } else {
          this.error.set('Something went wrong. Please try again.');
        }
      } else {
        this.error.set('Something went wrong. Please try again.');
      }
      this.loading.set(false);
    }
  }
}
