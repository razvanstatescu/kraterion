# Kraterion worker — renewal engine + gRPC checkpoint indexer + BullMQ
# embeddings/session-archive processors (NestJS, health on port 4003).
#
# Build context is the REPO ROOT (App Platform: dockerfile_path =
# apps/worker/Dockerfile, source_dir = /). The whole pnpm workspace is
# needed because this app imports every workspace package built here.
#
# Single stage on purpose — see apps/control-plane/Dockerfile for the
# rationale (pnpm symlink layout + ESM NodeNext resolution).
FROM node:20-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm db:generate

RUN pnpm --filter "@kraterion/worker..." run build

ENV NODE_ENV=production
WORKDIR /app/apps/worker
EXPOSE 4003
CMD ["node", "dist/main.js"]
