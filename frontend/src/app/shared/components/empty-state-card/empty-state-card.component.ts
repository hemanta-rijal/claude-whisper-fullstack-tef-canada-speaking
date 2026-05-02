import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Centered “no data yet” panel reused on dashboard, results, and similar flows.
 * LEARN: `input()` defines standalone-friendly inputs; parent passes strings + optional router paths.
 */
@Component({
  selector: 'app-empty-state-card',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './empty-state-card.component.html',
  styleUrl: './empty-state-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateCardComponent {
  /** Main heading (e.g. “No data yet”). */
  title = input.required<string>();
  /** Supporting copy under the title. */
  description = input.required<string>();
  /** Primary CTA route — omitted when you only want copy (or wire actions elsewhere via projection later). */
  primaryLink = input<string | undefined>();
  /** Label for the primary router link button. */
  primaryLabel = input<string>('Continue');
  /** Optional second link (e.g. back to overview). */
  secondaryLink = input<string | undefined>();
  secondaryLabel = input<string | undefined>();
}
