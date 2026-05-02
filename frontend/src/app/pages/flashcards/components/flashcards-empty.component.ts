import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { FlashStudyTrack } from '../../../data/tef-vocab-deck';

@Component({
  selector: 'app-flashcards-empty',
  standalone: true,
  templateUrl: './flashcards-empty.component.html',
  styleUrl: './flashcards-empty.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlashcardsEmptyComponent {
  variant = input.required<'track' | 'done'>();
  /** French module label — only for `track` variant. */
  trackLabel = input<string>('');
  studyTrackKey = input<FlashStudyTrack>('writing');

  shuffleAgain = output<void>();
}
