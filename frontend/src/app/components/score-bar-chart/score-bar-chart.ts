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
import type { ChartDimension } from '../score-radar-chart/score-radar-chart';

@Component({
  selector: 'app-score-bar-chart',
  standalone: true,
  template: `<div class="chart-surface"><canvas #cv aria-label="Scores by dimension"></canvas></div>`,
  styleUrl: './score-bar-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoreBarChart implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) dimensions: ChartDimension[] = [];

  @ViewChild('cv', { static: false }) private canvas?: ElementRef<HTMLCanvasElement>;

  private chart: Chart<'bar'> | null = null;
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

    const colors = [
      'rgba(34, 211, 238, 0.85)',
      'rgba(167, 139, 250, 0.85)',
      'rgba(244, 114, 182, 0.85)',
      'rgba(52, 211, 153, 0.85)',
    ];

    this.chart = new Chart(el, {
      type: 'bar',
      data: {
        labels: this.dimensions.map(d => d.label),
        datasets: [
          {
            data: this.dimensions.map(d => d.value),
            backgroundColor: this.dimensions.map((_, i) => colors[i % colors.length]!),
            borderRadius: 8,
            borderSkipped: false,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            min: 0,
            max: 5,
            ticks: { stepSize: 1, color: 'rgba(148, 163, 184, 0.9)' },
            grid: { color: 'rgba(51, 65, 85, 0.5)' },
          },
          y: {
            ticks: { color: 'rgb(203, 213, 225)', font: { size: 11 } },
            grid: { display: false },
          },
        },
        plugins: { legend: { display: false } },
      },
    });
  }
}
