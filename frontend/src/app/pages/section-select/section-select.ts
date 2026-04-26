import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

type Section = 'A' | 'B';

@Component({
  selector: 'app-section-select',
  imports: [RouterLink],
  templateUrl: './section-select.html',
  styleUrl: './section-select.scss',
})
export class SectionSelect {
  private router = inject(Router);
  selected = signal<Section | null>(null);

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
