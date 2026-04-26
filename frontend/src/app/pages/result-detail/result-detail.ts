import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AttemptService, TestResult } from '../../services/attempt';
import { DecimalPipe, DatePipe } from '@angular/common';

// Shared type describing each scored dimension shown in the breakdown card
type ScoreRow = { label: string; score: number };

@Component({
  selector: 'app-result-detail',
  imports: [RouterLink, DecimalPipe, DatePipe],
  templateUrl: './result-detail.html',
  styleUrl: './result-detail.scss',
})
export class ResultDetail implements OnInit {
  private route = inject(ActivatedRoute);
  private attemptService = inject(AttemptService);

  result = signal<TestResult | null>(null);
  loading = signal(true);
  error = signal('');

  ngOnInit() {
    // ActivatedRoute gives us the :id param from the URL (e.g. /results/abc123)
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.load(id);
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

  // Build the four dimension rows from the result object
  get scoreRows(): ScoreRow[] {
    const r = this.result();
    if (!r) return [];
    return [
      { label: 'Lexical Richness', score: r.lexicalRichness },
      { label: 'Task Fulfillment', score: r.taskFulfillment },
      { label: 'Grammar',          score: r.grammar },
      { label: 'Coherence',        score: r.coherence },
    ];
  }

}
