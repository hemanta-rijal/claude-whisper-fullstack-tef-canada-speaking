import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { AppShellHeaderComponent } from '../../shared/components/app-shell-header/app-shell-header.component';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { shellActions } from '../../shared/state/shell/shell.actions';
import {
  VocabularyBuilderService,
  type VocabularyBuildResult,
} from '../../services/vocabulary-builder';

/**
 * Standalone page: TEF Canada expression écrite prep — une entrée lexicale → phrases type Section A/B + famille de mots.
 * @Component marks this class as an Angular component (selector + template + change detection policy).
 */
@Component({
  selector: 'app-vocabulary-builder',
  imports: [AppShellHeaderComponent, PageHeroComponent, FormsModule],
  templateUrl: './vocabulary-builder.html',
  styleUrl: './vocabulary-builder.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VocabularyBuilder implements OnInit {
  private store = inject(Store);
  private vocabApi = inject(VocabularyBuilderService);

  /** Bound with [(ngModel)] — user word or expression (French). */
  expressionInput = '';

  loading = signal(false);
  error = signal<string | null>(null);
  result = signal<VocabularyBuildResult | null>(null);

  ngOnInit(): void {
    this.store.dispatch(shellActions.brandTaglineSet({ tagline: 'Writing · vocab builder' }));
  }

  async submit(): Promise<void> {
    const raw = this.expressionInput.trim();
    if (!raw || this.loading()) return;

    this.loading.set(true);
    this.error.set(null);
    this.result.set(null);

    try {
      const data = await this.vocabApi.build(raw);
      this.result.set(data);
    } catch {
      this.error.set('Generation failed. Check your connection and API configuration, then try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
