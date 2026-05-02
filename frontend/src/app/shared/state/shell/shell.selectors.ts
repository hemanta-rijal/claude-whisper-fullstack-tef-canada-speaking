import { createFeatureSelector, createSelector } from '@ngrx/store';
import type { ShellState } from './shell.reducer';

/** LEARN: Feature selector ties to `provideStore({ shell: shellReducer })` key name `shell`. */
export const selectShellState = createFeatureSelector<ShellState>('shell');

export const selectShellBrandTagline = createSelector(selectShellState, (s) => s.brandTagline);
