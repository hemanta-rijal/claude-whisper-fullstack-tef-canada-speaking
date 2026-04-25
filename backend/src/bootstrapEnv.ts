import { loadLocalEnv } from './lib/env.js';

// ESM import-order gotcha: module imports are evaluated *before* the rest of your file runs.
// If Prisma (or anything else) reads `process.env` at import time, you must load `.env` first.
// This tiny module exists solely to be imported as the **first** import in `index.ts`.
loadLocalEnv();
