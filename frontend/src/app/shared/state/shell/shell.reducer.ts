import { createReducer, on } from '@ngrx/store';
import { shellActions } from './shell.actions';

export interface ShellState {
  brandTagline: string;
}

export const initialShellState: ShellState = {
  brandTagline: 'Speaking lab',
};

export const shellReducer = createReducer(
  initialShellState,
  on(shellActions.brandTaglineSet, (_state, { tagline }) => ({
    brandTagline: tagline,
  })),
);
