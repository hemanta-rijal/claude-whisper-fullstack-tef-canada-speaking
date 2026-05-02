import { Injectable, signal } from '@angular/core';

/** Persisted appearance — maps to `<html data-theme="…">` for CSS. */
export type AppTheme = 'light' | 'dark';

const STORAGE_KEY = 'app-theme-v1';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  /** LEARN: `signal` lets templates react when the user picks Light/Dark on Settings. */
  readonly preference = signal<AppTheme>('dark');

  /** Called from APP_INITIALIZER so the first paint matches localStorage (no flash). */
  hydrateFromStorage(): void {
    const mode = this.readStorage() ?? 'dark';
    this.preference.set(mode);
    this.applyDom(mode);
  }

  setTheme(mode: AppTheme): void {
    this.preference.set(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* private mode / quota */
    }
    this.applyDom(mode);
  }

  private readStorage(): AppTheme | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === 'light' || raw === 'dark') return raw;
    } catch {
      /* noop */
    }
    return null;
  }

  private applyDom(mode: AppTheme): void {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset['theme'] = mode;
  }
}
