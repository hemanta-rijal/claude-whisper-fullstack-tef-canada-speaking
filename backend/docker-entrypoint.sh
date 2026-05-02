#!/bin/sh
set -e

echo "▶ Running Prisma migrations..."
npx prisma migrate deploy
echo "✔ Migrations complete"

echo "▶ Starting backend server..."
exec node dist/src/index.js
