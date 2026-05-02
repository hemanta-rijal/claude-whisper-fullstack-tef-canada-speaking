import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { FlashStudyTrack, TefModuleKey } from '../../../data/tef-vocab-deck';

@Component({
  selector: 'app-flashcards-hero',
  standalone: true,
  templateUrl: './flashcards-hero.component.html',
  styleUrl: './flashcards-hero.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlashcardsHeroComponent {
  studyTrack = input.required<FlashStudyTrack>();
  moduleLabels = input.required<Record<TefModuleKey, string>>();
  knownCount = input.required<number>();

  /** LEARN: `output()` replaces `@Output()` EventEmitter for parent bindings `(trackChange)="selectTrack($event)"`. */
  trackChange = output<FlashStudyTrack>();
  shuffle = output<void>();
  dueOrder = output<void>();
  resetProgress = output<void>();
}
