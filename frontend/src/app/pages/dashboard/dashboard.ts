import { ChangeDetectionStrategy, Component, computed, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { AuthService } from '../../services/auth';
import { AttemptService, type TestResult } from '../../services/attempt';
import { ScoreTrendChart } from '../../components/score-trend-chart/score-trend-chart';
import { RubricTrendChart } from '../../components/rubric-trend-chart/rubric-trend-chart';

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

type DimensionRank = { key: string; val: number };

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe, DecimalPipe, ScoreTrendChart, RubricTrendChart],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard implements OnInit {
  auth = inject(AuthService);
  private attemptService = inject(AttemptService);

  results = signal<TestResult[]>([]);
  loading = signal(true);

  /** API returns newest first — best for “latest suggestions”. */
  readonly latestResult = computed(() => this.results()[0] ?? null);

  /** Highest overall in the loaded window. */
  readonly bestExam = computed((): TestResult | null => {
    const rows = this.results();
    if (!rows.length) return null;
    return rows.reduce((best, r) => (r.overallScore > best.overallScore ? r : best), rows[0]!);
  });

  /** Mean score per rubric dimension across loaded exams. */
  readonly dimensionAverages = computed(() => {
    const rows = this.results();
    if (!rows.length) return null;
    const n = rows.length;
    const sum = (pick: (r: TestResult) => number) => rows.reduce((a, r) => a + pick(r), 0);
    return {
      lexical: round1(sum(r => r.lexicalRichness) / n),
      task: round1(sum(r => r.taskFulfillment) / n),
      grammar: round1(sum(r => r.grammar) / n),
      coherence: round1(sum(r => r.coherence) / n),
    };
  });

  /** Which averaged dimension is strongest vs needs work. */
  readonly dimensionInsight = computed((): { strongest: DimensionRank; weakest: DimensionRank } | null => {
    const av = this.dimensionAverages();
    if (!av) return null;
    const entries: DimensionRank[] = [
      { key: 'Lexical richness', val: av.lexical },
      { key: 'Task fulfillment', val: av.task },
      { key: 'Grammar', val: av.grammar },
      { key: 'Coherence', val: av.coherence },
    ];
    const sorted = [...entries].sort((a, b) => b.val - a.val);
    return {
      strongest: sorted[0]!,
      weakest: sorted[3]!,
    };
  });

  /** Full suggestion text from the most recent exam ( examiner JSON ). */
  readonly latestSuggestions = computed(() => this.latestResult()?.suggestions ?? '');

  readonly trendPoints = computed(() => {
    const rows = this.results();
    if (rows.length < 2) return [];
    return [...rows]
      .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime())
      .map(r => ({
        label: new Date(r.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        value: r.overallScore,
      }));
  });

  /** Four rubric lines, oldest → newest (any count ≥1). */
  readonly rubricTrendPoints = computed(() => {
    const rows = this.results();
    if (!rows.length) return [];
    return [...rows]
      .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime())
      .map(r => ({
        label: new Date(r.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        lexical: r.lexicalRichness,
        task: r.taskFulfillment,
        grammar: r.grammar,
        coherence: r.coherence,
      }));
  });

  async ngOnInit() {
    try {
      const data = await this.attemptService.getRecentResults(10);
      this.results.set(data);
    } catch {
      // no results yet
    } finally {
      this.loading.set(false);
    }
  }

  async logout() {
    await this.auth.logout();
  }
}
