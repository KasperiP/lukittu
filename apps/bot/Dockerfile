FROM node:23-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# 1. Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy workspace configuration
COPY pnpm-workspace.yaml ./
COPY package.json ./

# Copy all package.json files from workspace packages
COPY apps/bot/package.json ./apps/bot/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies based on the preferred package manager
COPY pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# 2. Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy all workspace files
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/bot/node_modules ./apps/bot/node_modules
COPY --from=deps /app/pnpm-workspace.yaml ./
COPY --from=deps /app/package.json ./

# Copy source code
COPY packages ./packages
COPY apps ./apps

# Set working directory to the bot app
WORKDIR /app/apps/bot

# Generate Prisma client
RUN cd ../../packages/shared && pnpm run build

# Build the bot
RUN pnpm run build

# 3. Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 botuser

# Copy the built application
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/shared/prisma ./packages/shared/prisma
COPY --from=builder /app/apps/bot/dist ./apps/bot/dist
COPY --from=builder /app/apps/bot/package.json ./apps/bot/package.json
COPY --from=builder /app/apps/bot/node_modules ./apps/bot/node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

USER botuser
WORKDIR /app/apps/bot

CMD ["node", "dist/index.js"]
