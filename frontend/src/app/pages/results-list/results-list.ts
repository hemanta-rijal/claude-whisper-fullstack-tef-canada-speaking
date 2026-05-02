import { ChangeDetectionStrategy, Component, computed, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Store } from '@ngrx/store';
import { AttemptService, type TestResult } from '../../services/attempt';
import { ScoreTrendChart } from '../../components/score-trend-chart/score-trend-chart';
import { AppShellHeaderComponent } from '../../shared/components/app-shell-header/app-shell-header.component';
import { EmptyStateCardComponent } from '../../shared/components/empty-state-card/empty-state-card.component';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { shellActions } from '../../shared/state/shell/shell.actions';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-results-list',
  imports: [
    RouterLink,
    DatePipe,
    ScoreTrendChart,
    AppShellHeaderComponent,
    EmptyStateCardComponent,
    PageHeroComponent,
  ],
  templateUrl: './results-list.html',
  styleUrl: './results-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultsList implements OnInit {
  private store = inject(Store);
  private attemptService = inject(AttemptService);

  results = signal<TestResult[]>([]);
  /** Extra rows only for the trend chart (up to 30 recent), independent of current table page. */
  trendSource = signal<TestResult[]>([]);
  loading = signal(true);
  page = signal(1);
  totalPages = signal(0);
  total = signal(0);
  readonly pageSize = PAGE_SIZE;

  readonly trendPoints = computed(() => {
    const rows = this.trendSource();
    if (rows.length < 2) return [];
    return [...rows]
      .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime())
      .map(r => ({
        label: new Date(r.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        value: r.overallScore,
      }));
  });

  async ngOnInit() {
    this.store.dispatch(shellActions.brandTaglineSet({ tagline: 'All results' }));
    await Promise.all([this.loadPage(1), this.loadTrendSource()]);
  }

  private async loadTrendSource() {
    try {
      const recent = await this.attemptService.getRecentResults(30);
      this.trendSource.set(recent);
    } catch {
      this.trendSource.set([]);
    }
  }

  async loadPage(p: number) {
    this.loading.set(true);
    try {
      const data = await this.attemptService.getResultsPaged(p, PAGE_SIZE);
      this.results.set(data.items);
      this.page.set(data.page);
      this.totalPages.set(data.totalPages);
      this.total.set(data.total);
    } catch {
      this.results.set([]);
      this.total.set(0);
      this.totalPages.set(0);
    } finally {
      this.loading.set(false);
    }
  }

  goPrev() {
    if (this.page() > 1) void this.loadPage(this.page() - 1);
  }

  goNext() {
    if (this.page() < this.totalPages()) void this.loadPage(this.page() + 1);
  }
}
