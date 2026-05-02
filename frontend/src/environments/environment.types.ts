/** Shared shape for `environment` / `environment.prod` — aligns with backend via same-origin `/api` + proxy. */
export type FlashcardTtsMode = 'api' | 'browser';

export type EnvironmentConfig = {
  production: boolean;
  /**
   * REST + static assets (`/api` → nginx proxy in Docker / prod; Angular dev proxy locally).
   * LEARN: In Compose, nginx forwards `/api` to the `backend` service — no host/port in this string.
   */
  apiUrl: string;
  flashcardTtsMode: FlashcardTtsMode;
};
