import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeService, type AppTheme } from '../../services/theme.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  /** LEARN: appearance lives in `ThemeService` so any page can read `preference()` reactively. */
  theme = inject(ThemeService);

  setTheme(mode: AppTheme): void {
    this.theme.setTheme(mode);
  }
}
