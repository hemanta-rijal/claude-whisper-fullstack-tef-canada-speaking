/**
 * Registers Chart.js controllers/scales once (tree-shaken bundle).
 * LEARN: Chart.js v4 requires explicit registration — importing `Chart` alone does not register controllers.
 */
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  RadialLinearScale,
  RadarController,
  Tooltip,
} from 'chart.js';

let registered = false;

export function registerChartJS(): void {
  if (registered) return;
  Chart.register(
    ArcElement,
    BarController,
    BarElement,
    CategoryScale,
    DoughnutController,
    Filler,
    Legend,
    LineController,
    LineElement,
    LinearScale,
    PointElement,
    RadialLinearScale,
    RadarController,
    Tooltip,
  );
  registered = true;
}
