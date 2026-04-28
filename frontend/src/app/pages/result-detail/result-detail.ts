import { ChangeDetectionStrategy, Component, computed, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AttemptService, TestResult } from '../../services/attempt';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ScoreRadarChart, type ChartDimension } from '../../components/score-radar-chart/score-radar-chart';
import { ScoreBarChart } from '../../components/score-bar-chart/score-bar-chart';

@Component({
  selector: 'app-result-detail',
  imports: [RouterLink, DatePipe, DecimalPipe, ScoreRadarChart, ScoreBarChart],
  templateUrl: './result-detail.html',
  styleUrl: './result-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultDetail implements OnInit {
  private route = inject(ActivatedRoute);
  private attemptService = inject(AttemptService);

  result = signal<TestResult | null>(null);
  loading = signal(true);
  error = signal('');

  /** Stable reference for chart inputs — avoids re-rendering Chart.js on every CD tick (OnPush + computed). */
  readonly chartDimensions = computed<ChartDimension[]>(() => {
    const r = this.result();
    if (!r) return [];
    return [
      { label: 'Lexical', value: r.lexicalRichness },
      { label: 'Task', value: r.taskFulfillment },
      { label: 'Grammar', value: r.grammar },
      { label: 'Coherence', value: r.coherence },
    ];
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    void this.load(id);
  }

  private async load(id: string) {
    try {
      const data = await this.attemptService.getResultById(id);
      this.result.set(data);
    } catch {
      this.error.set('Could not load this result.');
    } finally {
      this.loading.set(false);
    }
  }
}
