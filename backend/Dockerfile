# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Generate Prisma client before compiling TypeScript
RUN npx prisma generate

COPY . .

RUN npm run build

# ── Stage 2: production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies
RUN npm ci --omit=dev && npx prisma generate

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/src/index.js"]
