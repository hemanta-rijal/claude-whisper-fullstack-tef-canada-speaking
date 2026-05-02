import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { AppShellHeaderComponent } from '../../shared/components/app-shell-header/app-shell-header.component';
import { shellActions } from '../../shared/state/shell/shell.actions';

type Section = 'A' | 'B';

@Component({
  selector: 'app-section-select',
  imports: [AppShellHeaderComponent],
  templateUrl: './section-select.html',
  styleUrl: './section-select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionSelect implements OnInit {
  private router = inject(Router);
  private store = inject(Store);

  selected = signal<Section | null>(null);

  ngOnInit(): void {
    this.store.dispatch(shellActions.brandTaglineSet({ tagline: 'Choose section' }));
  }

  select(section: Section) {
    this.selected.set(section);
  }

  startExam() {
    if (!this.selected()) return;
    // Pass the chosen section via router state — no URL param needed.
    // LEARN: router state is accessible in the destination component via window.history.state
    this.router.navigate(['/exam'], { state: { section: this.selected() } });
  }
}
