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
    throw new Error('Missing DATABASE_URL (expected a MySQL connection string like mysql://...)');
  }

  if (!raw.startsWith('mysql://') && !raw.startsWith('mysql2://')) {
    throw new Error(`Invalid DATABASE_URL: must start with mysql:// or mysql2:// (got: "${raw.slice(0, 20)}...")`);
  }
  return raw;
}

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val || val.trim() === '' || val === `your-${key.toLowerCase().replace(/_/g, '-')}-here`) {
    throw new Error(`Missing or placeholder value for ${key} in .env`);
  }
  return val;
}

export function getEnv(): AppEnv {
  return {
    nodeEnv: parseNodeEnv(process.env.NODE_ENV),
    port: parsePort(process.env.PORT, 3000),
    databaseUrl: parseDatabaseUrl(process.env.DATABASE_URL),
    openAiApiKey: requireEnv('OPENAI_API_KEY'),
    anthropicApiKey: requireEnv('ANTHROPIC_API_KEY'),
  };
}
