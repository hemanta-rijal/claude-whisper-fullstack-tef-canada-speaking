import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { AuthService } from '../../services/auth';
import { AttemptService, type TestResult } from '../../services/attempt';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  auth = inject(AuthService);
  private attemptService = inject(AttemptService);

  results = signal<TestResult[]>([]);
  loading = signal(true);

  async ngOnInit() {
    try {
      const data = await this.attemptService.getResults();
      this.results.set(data);
    } catch {
      // silently ignore — user just has no results yet
    } finally {
      this.loading.set(false);
    }
  }

  async logout() {
    await this.auth.logout();
  }
}
