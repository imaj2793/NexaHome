# syntax=docker/dockerfile:1
#
# Image produksi untuk @nexahome/web (Next.js App Router, output standalone).
#
# Tahapan:
#   manifests - hanya package.json + lockfile (cache layer install)
#   deps      - dependensi build untuk root + web
#   builder   - `next build` dengan output standalone
#   runner    - image final, hanya server.js + artefak build
#
# Build:  docker build -f apps/web/Dockerfile \
#           --build-arg NEXT_PUBLIC_API_URL=http://localhost:3001/api -t nexahome-web .
# Run:    docker run --rm -p 3000:3000 nexahome-web
#
# NEXT_PUBLIC_* di-inline saat build, jadi argumen build wajib diisi ulang bila
# URL API berubah (lihat docs/DEVELOPMENT.md).

ARG NODE_IMAGE=node:22-bookworm-slim

# ── base ─────────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable \
 && corepack prepare pnpm@12.6.0 --activate \
 && pnpm config set store-dir /pnpm/store \
 && apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ── manifests ────────────────────────────────────────────────────────────────
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
# Root ikut dipasang karena `next build` melakukan type-check dan membutuhkan
# typescript yang dideklarasikan sebagai devDependency di root.
FROM manifests AS deps
RUN --mount=type=cache,id=nexahome-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "nexahome" --filter "@nexahome/web..."

# ── builder ──────────────────────────────────────────────────────────────────
FROM deps AS builder
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
COPY . .
RUN pnpm --filter @nexahome/web build

# ── runner ───────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# `output: 'standalone'` menyertakan server.js + node_modules minimal.
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
