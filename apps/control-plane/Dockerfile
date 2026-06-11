# Kraterion control-plane (NestJS + Fastify, port 4001).
#
# Build context is the REPO ROOT (App Platform: dockerfile_path =
# apps/control-plane/Dockerfile, source_dir = /). The whole pnpm
# workspace is needed because this app imports workspace packages
# (@kraterion/shared, walrus-client, seal-client, kraterion-move-sdk,
# embeddings-client) that are built from source here.
#
# Single stage on purpose: pnpm's symlinked node_modules layout + ESM
# NodeNext resolution makes cross-stage copying fragile. We trade a
# larger image for a build that resolves modules identically to how it
# was built. Prune is intentionally avoided so the workspace symlink
# farm stays intact.
FROM node:20-slim

# openssl + ca-certificates are required by Prisma's query engine at
# both generate-time and runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Pin pnpm to the version in package.json#packageManager via corepack.
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

# Copy the whole workspace (build artifacts/installs excluded by
# .dockerignore). Move SDK bindings under src/generated are committed,
# so no Sui toolchain is needed.
COPY . .

# Install all deps (dev deps are needed to build: nest cli, tsc).
# NODE_ENV is left unset here so devDependencies are installed.
RUN pnpm install --frozen-lockfile

# Generate the Prisma client (schema lives at repo root). Must run
# before the TypeScript build, which type-checks against @prisma/client.
RUN pnpm db:generate

# Build this app and its workspace dependencies, in topological order.
# The `...` suffix selects the package plus its deps; pnpm runs their
# `build` scripts (tsc / nest build) respecting the dependency graph.
RUN pnpm --filter "@kraterion/control-plane..." run build

ENV NODE_ENV=production
WORKDIR /app/apps/control-plane
EXPOSE 4001
CMD ["node", "dist/main.js"]
