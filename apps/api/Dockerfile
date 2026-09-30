# syntax=docker/dockerfile:1
#
# Image produksi untuk @nexahome/api (NestJS + Prisma).
#
# Tahapan:
#   base      - Node + pnpm (corepack) + libssl untuk Prisma
#   manifests - hanya package.json + lockfile (cache layer install)
#   deps      - dependensi build untuk root, api, dan package turunan api
#   builder   - prisma generate + turbo build
#   migrate   - one-shot `prisma migrate deploy`
#   prod-deps - instalasi --prod (tanpa devDependency)
#   runner    - image final, user non-root
#
# Build:  docker build -f apps/api/Dockerfile -t nexahome-api .
# Run:    docker run --rm -p 3001:3001 --env-file .env nexahome-api

ARG NODE_IMAGE=node:22-bookworm-slim

# ── base ─────────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable \
 && corepack prepare pnpm@12.6.0 --activate \
 && pnpm config set store-dir /pnpm/store \
 && apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ── manifests ────────────────────────────────────────────────────────────────
# Lockfile memuat seluruh workspace, jadi semua package.json harus ada agar
# `--frozen-lockfile` tidak menganggap ada paket yang terhapus.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/ai/package.json ./packages/ai/package.json
COPY packages/device-core/package.json ./packages/device-core/package.json
COPY packages/integration-mqtt/package.json ./packages/integration-mqtt/package.json
COPY packages/integration-tasmota/package.json ./packages/integration-tasmota/package.json
COPY packages/types/package.json ./packages/types/package.json

# ── deps ─────────────────────────────────────────────────────────────────────
# Root + api + package yang dipakai api. Dependensi web sengaja tidak diikutkan
# supaya image API tidak membawa Next.js.
FROM manifests AS deps
RUN --mount=type=cache,id=nexahome-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "nexahome" --filter "@nexahome/api..."

# ── builder ──────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
RUN pnpm db:generate
RUN pnpm turbo run build --filter="@nexahome/api..."

# Prisma Client hasil `generate` berada di dalam virtual store pnpm
# (node_modules/.pnpm/<pkg>@<versi>/node_modules/.prisma). Image runtime memakai
# instalasi --prod: paket @prisma/client ikut terpasang tetapi isinya belum
# ter-generate, dan CLI `prisma` tidak ada (devDependency). Salin dulu ke /tmp
# supaya bisa di-COPY ke tahap migrate/runner tanpa bergantung pada nama folder
# versi di lockfile.
RUN node docker/prisma-client/prisma-client.mjs export /app/apps/api /tmp/prisma-client

# ── migrate ──────────────────────────────────────────────────────────────────
# Dijalankan sekali oleh compose sebelum API start:
#   docker compose run --rm migrate                      # prisma migrate deploy
#   docker compose run --rm migrate pnpm exec prisma db seed
FROM deps AS migrate
COPY docker/prisma-client/prisma-client.mjs ./docker/prisma-client/prisma-client.mjs
COPY --from=builder /tmp/prisma-client /tmp/prisma-client
COPY apps/api/prisma ./apps/api/prisma
RUN node docker/prisma-client/prisma-client.mjs install /tmp/prisma-client /app/apps/api
WORKDIR /app/apps/api
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ── prod-deps ────────────────────────────────────────────────────────────────
FROM manifests AS prod-deps
RUN --mount=type=cache,id=nexahome-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@nexahome/api..."

# ── runner ───────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production \
    API_PORT=3001
COPY --from=prod-deps --chown=node:node /app /app

# Pasang Prisma Client ke lokasi yang dicari @prisma/client saat runtime,
# lalu buang salinan sementara.
COPY --from=builder --chown=node:node /tmp/prisma-client /tmp/prisma-client
COPY docker/prisma-client/prisma-client.mjs ./docker/prisma-client/prisma-client.mjs
RUN node docker/prisma-client/prisma-client.mjs install /tmp/prisma-client /app/apps/api

# Artefak build: API + package workspace yang diimpor API.
COPY --from=builder --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=node:node /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=node:node /app/packages/ai/dist ./packages/ai/dist
COPY --from=builder --chown=node:node /app/packages/device-core/dist ./packages/device-core/dist
COPY --from=builder --chown=node:node /app/packages/integration-mqtt/dist ./packages/integration-mqtt/dist
COPY --from=builder --chown=node:node /app/packages/integration-tasmota/dist ./packages/integration-tasmota/dist
COPY --from=builder --chown=node:node /app/packages/types/dist ./packages/types/dist

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/main.js"]
