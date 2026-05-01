import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.join(__dirname, '..', '..');

export type AppEnv = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  // API keys are validated lazily when a feature is first called, not at startup.
  // This lets the server boot and serve health checks even if a key is missing.
  openAiApiKey: string;
  anthropicApiKey: string;
};

export function loadLocalEnv(): void {
  const envPath = path.join(packageRoot, '.env');
  if (!existsSync(envPath)) return;
  loadEnvFile(envPath);
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65_535) {
    throw new Error(`Invalid PORT: "${raw}" (expected 1-65535)`);
  }
  return parsed;
}

function parseNodeEnv(raw: string | undefined): AppEnv['nodeEnv'] {
  const v = (raw ?? 'development').toLowerCase();
  if (v === 'development' || v === 'test' || v === 'production') return v;
  throw new Error(`Invalid NODE_ENV: "${raw}" (expected development|test|production)`);
}

function parseDatabaseUrl(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === '') {
    throw new Error('Missing DATABASE_URL');
  }
  if (!raw.startsWith('postgresql://') && !raw.startsWith('postgres://') &&
      !raw.startsWith('mysql://') && !raw.startsWith('mysql2://')) {
    throw new Error(`Invalid DATABASE_URL scheme (got: "${raw.slice(0, 20)}...")`);
  }
  return raw;
}

// Reads an env var at startup — warns if missing but does NOT throw.
// Services that need the key must call requireApiKey() at call-time.
function readApiKey(key: string): string {
  const val = process.env[key];
  if (!val || val.trim() === '') {
    console.warn(`[env] WARNING: ${key} is not set. Features that use it will fail at runtime.`);
    return '';
  }
  return val;
}

// Call this inside a service function, not at module load time.
// Throws with a clear message so the HTTP handler can return 503.
export function requireApiKey(key: 'openAiApiKey' | 'anthropicApiKey'): string {
  const envKey = key === 'openAiApiKey' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
  const val = process.env[envKey];
  if (!val || val.trim() === '') {
    throw new Error(`${envKey} is not configured. Set it in .env and restart.`);
  }
  return val;
}

export function getEnv(): AppEnv {
  return {
    nodeEnv: parseNodeEnv(process.env.NODE_ENV),
    port: parsePort(process.env.PORT, 3000),
    databaseUrl: parseDatabaseUrl(process.env.DATABASE_URL),
    openAiApiKey: readApiKey('OPENAI_API_KEY'),
    anthropicApiKey: readApiKey('ANTHROPIC_API_KEY'),
  };
}
