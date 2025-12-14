FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app


# Copy workspace configuration and .npmrc
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY .npmrc ./


# Copy shared package configuration
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
COPY pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @lukittu/shared...

# Build migration image
FROM base AS migration
WORKDIR /app


# Copy dependencies from deps stage and .npmrc
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/pnpm-workspace.yaml ./
COPY --from=deps /app/package.json ./
COPY --from=deps /app/.npmrc ./

# Copy shared package source
COPY packages/shared ./packages/shared

# Generate Prisma client
WORKDIR /app/packages/shared
RUN pnpm run generate

# Set default working directory
WORKDIR /app/packages/shared

# Default command runs migrations
CMD ["pnpm", "run", "deploy"]
