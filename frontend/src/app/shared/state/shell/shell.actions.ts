import { createActionGroup, props } from '@ngrx/store';

/**
 * LEARN: NgRx groups UI metadata so any component can react via store.select(...) → Observable.
 * Example: each route dispatches `brandTaglineSet` on enter; the shell header subscribes with AsyncPipe.
 */
export const shellActions = createActionGroup({
  source: 'Shell',
  events: {
    /** Subtitle under “TEF Canada” in the shared header (per-route context). */
    'Brand Tagline Set': props<{ tagline: string }>(),
  },
});
