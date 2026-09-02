# syntax=docker/dockerfile:1

# Flanca (Next.js + Prisma) production image, built for Azure App Service /
# Container Apps. Multi-stage so the shipped image is just the Next.js
# "standalone" server output — not the full node_modules/source tree.

ARG NODE_VERSION=22-bookworm-slim

# ---------------------------------------------------------------------------
# deps: install the full dependency tree (dev deps included — needed to build)
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# builder: generate the Prisma client and build the Next.js app
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

RUN corepack enable

# Without this, `prisma generate` can't detect the base image's OpenSSL
# version and silently guesses 1.1.x — the wrong engine binary for
# bookworm's OpenSSL 3.0, which fails at runtime rather than at build time.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time-only placeholders so `next build` can statically analyze pages
# that read env vars; real values are supplied at container runtime.
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

# ---------------------------------------------------------------------------
# runner: minimal production image — just the standalone server output
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

# Prisma's query engine links against OpenSSL; the slim base doesn't ship it.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3500

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3500

# Azure App Service / Container Apps can point their health probe at this.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
