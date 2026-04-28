import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { Chart, type ChartConfiguration, type ChartDataset } from 'chart.js';
import { registerChartJS } from '../../lib/chart-register';

/** One exam on the timeline — four rubric scores 0–5. */
export type RubricTrendPoint = {
  label: string;
  lexical: number;
  task: number;
  grammar: number;
  coherence: number;
};

@Component({
  selector: 'app-rubric-trend-chart',
  standalone: true,
  template: `<div class="chart-surface"><canvas #cv aria-label="Lexical, task, grammar and coherence over time"></canvas></div>`,
  styleUrl: './rubric-trend-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RubricTrendChart implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) points: RubricTrendPoint[] = [];

  /**
   * Horizontal reference on the same 0–5 rubric as the evaluator (see backend evaluator prompt).
   * ~4/5 matches “clearly above B1 band” in our calibration — a practical B2+ / CLB 7 style goal line, not an official Éducation/IRCC mapping.
   */
  @Input() goalRubricScore = 4;

  /** Legend label for the goal line; set empty to hide from legend only (line still shows). */
  @Input() goalLabel = 'Target (~B2+ / CLB 7)';

  @ViewChild('cv', { static: false }) private canvas?: ElementRef<HTMLCanvasElement>;

  private chart: Chart<'line'> | null = null;
  private viewReady = false;

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.render();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.viewReady) this.render();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.chart = null;
  }

  private render(): void {
    const el = this.canvas?.nativeElement;
    if (!el || this.points.length === 0) return;

    registerChartJS();
    this.chart?.destroy();

    const labels = this.points.map(p => p.label);

    const goalY = this.goalRubricScore;
    const showGoal = goalY > 0 && goalY < 5;

    // Rubric series first; goal line last so it draws on top.
    const datasets: ChartDataset<'line'>[] = [
      {
        label: 'Lexical',
        data: this.points.map(p => p.lexical),
        borderColor: 'rgb(34, 211, 238)',
        backgroundColor: 'rgba(34, 211, 238, 0.08)',
        borderWidth: 2,
        tension: 0.25,
        fill: false,
        pointRadius: 3,
      },
      {
        label: 'Task',
        data: this.points.map(p => p.task),
        borderColor: 'rgb(167, 139, 250)',
        backgroundColor: 'rgba(167, 139, 250, 0.08)',
        borderWidth: 2,
        tension: 0.25,
        fill: false,
        pointRadius: 3,
      },
      {
        label: 'Grammar',
        data: this.points.map(p => p.grammar),
        borderColor: 'rgb(244, 114, 182)',
        backgroundColor: 'rgba(244, 114, 182, 0.08)',
        borderWidth: 2,
        tension: 0.25,
        fill: false,
        pointRadius: 3,
      },
      {
        label: 'Coherence',
        data: this.points.map(p => p.coherence),
        borderColor: 'rgb(52, 211, 153)',
        backgroundColor: 'rgba(52, 211, 153, 0.08)',
        borderWidth: 2,
        tension: 0.25,
        fill: false,
        pointRadius: 3,
      },
    ];

    if (showGoal) {
      datasets.push({
        label: this.goalLabel || 'Target',
        data: labels.map(() => goalY),
        borderColor: 'rgba(251, 191, 36, 0.92)',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [8, 5],
        tension: 0,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 0,
      });
    }

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: {
            min: 0,
            max: 5,
            ticks: { stepSize: 1, color: 'rgba(148, 163, 184, 0.9)' },
            grid: { color: 'rgba(51, 65, 85, 0.5)' },
          },
          x: {
            ticks: { color: 'rgb(203, 213, 225)', maxRotation: 45 },
            grid: { display: false },
          },
        },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              color: 'rgb(203, 213, 225)',
              boxWidth: 10,
              padding: 16,
              font: { size: 11 },
            },
          },
        },
      },
    };

    this.chart = new Chart(el, config);
  }
}
