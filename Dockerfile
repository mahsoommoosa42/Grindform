# Grindform — single-image deploy.
#
# Builds the Lit client, then runs the Bun/Hono server which serves both
# the static client and the JSON API from one process. PGlite keeps all
# data inside the container, so point GRINDFORM_DATA_DIR at a mounted
# volume to persist plans + logs across restarts.

FROM oven/bun:1.3.13 AS build
WORKDIR /app

# Install dependencies against the committed lockfile first (better layer
# caching), then copy the source and build the browser bundle.
COPY package.json bun.lock ./
COPY packages/api/package.json packages/api/package.json
COPY packages/catalog/package.json packages/catalog/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/planner/package.json packages/planner/package.json
COPY packages/tracker/package.json packages/tracker/package.json
COPY packages/web/package.json packages/web/package.json
RUN bun install --frozen-lockfile

COPY . .
RUN bun run --filter '@grindform/web' build:client

FROM oven/bun:1.3.13 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app

# The server resolves ./public relative to its working directory.
WORKDIR /app/packages/web

ENV PORT=3000
ENV GRINDFORM_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 3000

CMD ["bun", "run", "src/server.ts"]
