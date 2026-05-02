import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Shared airy page header: eyebrow + title + projected description + projected CTAs.
 * LEARN: `ng-content select="[pageHeroDesc]"` lets parents pass arbitrary markup (e.g. `<strong>`) without `innerHTML`.
 */
@Component({
  selector: 'app-page-hero',
  standalone: true,
  templateUrl: './page-hero.component.html',
  styleUrl: './page-hero.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeroComponent {
  eyebrow = input.required<string>();
  title = input.required<string>();
}
