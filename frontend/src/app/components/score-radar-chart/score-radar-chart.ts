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
import { Chart } from 'chart.js';
import { registerChartJS } from '../../lib/chart-register';

/** One rubric dimension — `value` is 0–5 from the evaluator. */
export type ChartDimension = { label: string; value: number };

@Component({
  selector: 'app-score-radar-chart',
  standalone: true,
  template: `<div class="chart-surface"><canvas #cv aria-label="Skill profile radar chart"></canvas></div>`,
  styleUrl: './score-radar-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoreRadarChart implements AfterViewInit, OnChanges, OnDestroy {
  /** @description Rad labels should be short so they fit the radar (e.g. "Lexical" not a full sentence). */
  @Input({ required: true }) dimensions: ChartDimension[] = [];

  @ViewChild('cv', { static: false }) private canvas?: ElementRef<HTMLCanvasElement>;

  private chart: Chart<'radar'> | null = null;
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
    if (!el || this.dimensions.length === 0) return;

    registerChartJS();
    this.chart?.destroy();

    const labels = this.dimensions.map(d => d.label);
    const data = this.dimensions.map(d => d.value);

    this.chart = new Chart(el, {
      type: 'radar',
      data: {
        labels,
        datasets: [
          {
            label: 'Score (/5)',
            data,
            borderColor: 'rgb(34, 211, 238)',
            backgroundColor: 'rgba(34, 211, 238, 0.22)',
            borderWidth: 2,
            pointBackgroundColor: 'rgb(34, 211, 238)',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: 'rgb(34, 211, 238)',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            min: 0,
            max: 5,
            ticks: { stepSize: 1, color: 'rgba(148, 163, 184, 0.85)', backdropColor: 'transparent' },
            grid: { color: 'rgba(51, 65, 85, 0.65)' },
            angleLines: { color: 'rgba(51, 65, 85, 0.65)' },
            pointLabels: { color: 'rgb(203, 213, 225)', font: { size: 11 } },
          },
        },
        plugins: {
          legend: { display: false },
        },
      },
    });
  }
}
