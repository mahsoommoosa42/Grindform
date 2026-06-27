# Grindform

A single-user workout **planner + tracker**. Pick a goal, shape your week
(block out days for Pilates/Physio, reserve warm-up, cool-down and a
first-15-minutes physio slot), generate a 7-day split from an extensive
exercise library, then track sets/reps/load live as you train — in your
choice of theme, on any device.

Built as a Bun monorepo mirroring the
[Quillcast](https://github.com/mahsoommoosa42/Quillcast) architecture:
typed branded IDs, a `Result` error taxonomy, Drizzle + PGlite, a Hono
API, and Lit on the front end.

## Packages

| Package               | Responsibility                                              |
| --------------------- | ---------------------------------------------------------- |
| `@grindform/core`     | Branded IDs, `Result`, error taxonomy, Zod schemas         |
| `@grindform/catalog`  | The exercise library + query/filter logic                  |
| `@grindform/planner`  | Deterministic weekly-plan generator (goals, blocks, A/B)   |
| `@grindform/db`       | Drizzle schema + repositories over PGlite/Postgres         |
| `@grindform/tracker`  | Set logging, day progress, progression suggestions         |
| `@grindform/api`      | Hono JSON API (`/v1/*`)                                     |
| `@grindform/web`      | Hono server + Lit single-page client + themes              |

## Develop

```sh
bun install
bun run dev            # builds the client and serves http://localhost:3000
```

Other useful scripts (run from the repo root):

```sh
bun run typecheck      # tsc --noEmit, strict
bun run lint           # eslint + (format:check for prettier)
bun run test:coverage  # vitest, 100% gate on every logical package
bun run test:e2e       # Playwright: Chromium + WebKit × mobile/tablet/laptop
```

## Configuration

| Env var              | Default    | Purpose                                          |
| -------------------- | ---------- | ------------------------------------------------ |
| `PORT`               | `3000`     | HTTP port the server listens on                  |
| `GRINDFORM_DATA_DIR` | in-memory  | Directory for the PGlite database; unset/`memory` = ephemeral |

## Deploy

The whole app is one container (client built in, API + static served by
one Bun process). Mount a volume at `GRINDFORM_DATA_DIR` to persist data.

**Docker / VPS**

```sh
docker build -t grindform .
docker run -p 3000:3000 -v grindform_data:/data grindform
```

**fly.io** — `fly volumes create grindform_data --size 1` then `fly deploy`
(see `fly.toml`).

**Railway** — point the service at this repo; it uses `railway.json`
(Dockerfile builder, `/v1/health` healthcheck). Add a volume and set
`GRINDFORM_DATA_DIR` to its mount path to persist data.
