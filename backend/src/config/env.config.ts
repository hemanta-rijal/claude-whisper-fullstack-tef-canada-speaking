import { getEnv as getEnvFromLib, type AppEnv, loadLocalEnv } from '../lib/env.js';

// Config module: keep all env access going through one place.
// This is just a thin wrapper around your existing `src/lib/env.ts` so the folder structure matches
// `src/config/` going forward.
export type { AppEnv };

export function loadLocalEnvFile(): void {
  loadLocalEnv();
}

export function getEnv(): AppEnv {
  return getEnvFromLib();
}

