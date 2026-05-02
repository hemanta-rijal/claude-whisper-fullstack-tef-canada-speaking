import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Store } from '@ngrx/store';
import { AuthService } from '../../../services/auth';
import { ThemeService } from '../../../services/theme.service';
import { selectShellBrandTagline } from '../../state/shell/shell.selectors';

@Component({
  selector: 'app-shell-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, AsyncPipe],
  templateUrl: './app-shell-header.component.html',
  styleUrl: './app-shell-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellHeaderComponent {
  /** Exposed for template — current user line under nav actions. */
  readonly auth = inject(AuthService);
  /** LEARN: Same ThemeService as Settings — toggling here updates `html[data-theme]` app-wide. */
  readonly theme = inject(ThemeService);
  private store = inject(Store);

  /**
   * LEARN: NgRx selectors return Observables; AsyncPipe subscribes/unsubscribes and marks OnPush views dirty when emissions arrive.
   * LEARN: Compare to a BehaviorSubject in a service — Store is global and time-travel/debuggable (DevTools extension optional).
   */
  readonly tagline$ = this.store.select(selectShellBrandTagline);

  async logout(): Promise<void> {
    await this.auth.logout();
  }
}
