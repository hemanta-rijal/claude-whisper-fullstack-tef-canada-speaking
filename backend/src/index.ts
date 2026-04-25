// IMPORTANT: import `./bootstrapEnv.js` first (see that file) so `backend/.env` is loaded
// before modules like Prisma that may read `process.env` at import time.
import './bootstrapEnv.js';
import { app } from './server.js';
import { getEnv } from './lib/env.js';
import { prisma } from './lib/prisma.js';

const { port, nodeEnv, databaseUrl } = getEnv();

function describeDatabaseTarget(databaseUrl: string): string {
  // Never log user/password from a connection URL.
  // `new URL` parses `mysql://user:pass@host:3306/db` into parts we can safely print.
  try {
    const u = new URL(databaseUrl);
    const host = u.hostname;
    const portPart = u.port ? `:${u.port}` : '';
    const db = u.pathname; // includes leading "/dbname"
    return `${u.protocol}//${host}${portPart}${db}`;
  } catch {
    return '(unparseable DATABASE_URL — check formatting)';
  }
}

// Never log secrets. It's OK to log high-level, non-secret config in dev.
if (nodeEnv === 'development') {
  console.log(`[config] NODE_ENV=${nodeEnv}`);
  console.log(`[config] DATABASE target: ${describeDatabaseTarget(databaseUrl)}`);
}

// DB-specific: `prisma.$connect()` opens a connection pool to MySQL.
// If this fails, your `DATABASE_URL` is wrong, MySQL isn't running/reachable, or credentials/DB name is invalid.
// LEARN: "connection pool" + why servers must not open a new DB connection for every request
void prisma
  .$connect()
  .then(() => {
    app.listen(port, () => {
      console.log(`Backend listening on http://localhost:${port}`);
    });
  })
  .catch((err: unknown) => {
    // TODO: make this a nicer error message for beginners (include common failure modes / SSL flags).
    console.error('Failed to connect to MySQL via Prisma', err);
    process.exit(1);
  });
