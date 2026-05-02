import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { VocabCard } from '../../../data/tef-vocab-deck';
import type { TtsLang } from '../../../services/tts';
import type { FlashGrade } from '../flashcard-model';

@Component({
  selector: 'app-flashcards-study-panel',
  standalone: true,
  templateUrl: './flashcards-study-panel.component.html',
  styleUrl: './flashcards-study-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlashcardsStudyPanelComponent {
  card = input.required<VocabCard>();
  flipped = input.required<boolean>();
  orderLength = input.required<number>();
  progressText = input.required<string>();
  ttsError = input<string | null>(null);
  ttsLoading = input<TtsLang | null>(null);

  flip = output<void>();
  playFrench = output<void>();
  rate = output<FlashGrade>();
  prev = output<void>();
  next = output<void>();

  /** Disable prev/next when only one card in queue. */
  readonly singleCard = computed(() => this.orderLength() <= 1);
}
