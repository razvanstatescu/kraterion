# Kraterion gateway — S3-compatible hot path (NestJS + Fastify, port 4002).
#
# Build context is the REPO ROOT (App Platform: dockerfile_path =
# apps/gateway/Dockerfile, source_dir = /). The whole pnpm workspace is
# needed because this app imports workspace packages (@kraterion/shared,
# walrus-client, seal-client, kraterion-move-sdk, object-bytes) built
# from source here.
#
# Single stage on purpose — see apps/control-plane/Dockerfile for the
# rationale (pnpm symlink layout + ESM NodeNext resolution).
#
# NOTE: the gateway sets a multi-GiB request body limit for Walrus
# blobs. DigitalOcean App Platform's ingress caps request bodies well
# below that. Large uploads must go direct-to-Walrus from the browser,
# or the gateway must run somewhere without that cap (Droplet / k8s).
# See docs/deployment-digitalocean.md.
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

RUN pnpm --filter "@kraterion/gateway..." run build

ENV NODE_ENV=production
WORKDIR /app/apps/gateway
EXPOSE 4002
CMD ["node", "dist/main.js"]
