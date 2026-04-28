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

/** Point for a time-style line chart (label = short date, value = score /5). */
export type TrendPoint = { label: string; value: number };

@Component({
  selector: 'app-score-trend-chart',
  standalone: true,
  template: `<div class="chart-surface"><canvas #cv aria-label="Overall score over recent exams"></canvas></div>`,
  styleUrl: './score-trend-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoreTrendChart implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) points: TrendPoint[] = [];
  /** @description Shown in legend — e.g. "Overall (/5)". */
  @Input() datasetLabel = 'Overall';

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

    this.chart = new Chart(el, {
      type: 'line',
      data: {
        labels: this.points.map(p => p.label),
        datasets: [
          {
            label: this.datasetLabel,
            data: this.points.map(p => p.value),
            borderColor: 'rgb(167, 139, 250)',
            backgroundColor: 'rgba(167, 139, 250, 0.15)',
            borderWidth: 2,
            fill: true,
            tension: 0.25,
            pointRadius: 4,
            pointBackgroundColor: 'rgb(192, 132, 252)',
            pointBorderColor: '#fff',
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
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
            labels: { color: 'rgb(203, 213, 225)', boxWidth: 12 },
          },
        },
      },
    });
  }
}
