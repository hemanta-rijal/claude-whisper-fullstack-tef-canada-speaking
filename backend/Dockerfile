# ── Stage 0: development (hot-reload via tsx watch) ─────────────────────────
FROM node:22-alpine AS development

ENV NODE_ENV=development

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci && npx prisma generate

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]

# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Generate Prisma client before compiling TypeScript
RUN npx prisma generate

COPY . .

RUN npm run build

# ── Stage 2: production ──────────────────────────────────────────────────────
FROM node:22-alpine AS production

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# prisma is in dependencies so migrate deploy works without devDeps
RUN npm ci --omit=dev && npx prisma generate

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Copy and prepare the entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
