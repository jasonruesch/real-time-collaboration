# Coalesce

A real-time collaborative whiteboard. Everyone edits the same canvas at once —
shapes, sticky notes, and freehand drawing — with live cursors and presence.
Concurrent edits merge conflict-free via [Yjs](https://yjs.dev) CRDTs, so the
board stays consistent even after a client goes offline and reconnects.

Part of [Jason Ruesch's portfolio](https://github.com/jasonruesch). Built on the
[`@jasonruesch/react`](https://www.npmjs.com/package/@jasonruesch/react) design
system.

## Why it exists

It closes the one gap the rest of the portfolio doesn't show: **real-time
collaboration** — WebSocket transport, presence/awareness, and conflict-free
concurrent editing — done for real, with no mocks.

## Architecture

A pnpm + Turborepo monorepo with a single-origin deployment:

| Package | What it is |
| --- | --- |
| `apps/web` | React 19 + Vite client. Filesystem routing via `@evolonix/react-router-next`, an SVG whiteboard, live cursors, and presence, all on the design system. |
| `apps/server` | Fastify server hosting a Yjs WebSocket sync backend (`y-protocols` sync + awareness). In production it also serves the built client, so the SPA and the `ws://…/yjs/<room>` upgrade share one origin. |
| `packages/board` | The shared whiteboard document model — shape types and pure geometry helpers — used by the client and by the server's room snapshot endpoint. |

- **CRDT:** each room is a `Y.Doc` with a `Y.Map` of shapes keyed by id, so
  concurrent creates/moves/deletes merge without conflict.
- **Presence:** live cursors and the participant list ride on Yjs *awareness*
  (ephemeral state, not persisted into the document).
- **Offline:** Yjs buffers local edits and the provider auto-reconnects; on
  reconnect the divergent states coalesce — hence the name.
- **Persistence:** with `DATABASE_URL` set, each room's CRDT snapshot is loaded
  from Postgres on open and written back (debounced) on edits, so boards survive
  restarts. Unset → in-memory only (zero-config dev).
- **Access:** boards have an owner; the owner mints `editor`/`viewer` share
  links (signed tokens). Viewers are read-only, enforced at the WebSocket layer.
- **Scale:** with `REDIS_URL` set, instances fan room updates out to each other
  over Redis pub/sub, so the app runs behind a load balancer across many
  machines. A per-connection token bucket rate-limits abusive sockets.
- **Editing:** pan/zoom canvas, multi-select with marquee, inline note text,
  copy/paste/duplicate, per-user undo/redo, and z-ordering.
- **Collaboration:** live cursors, selection awareness, follow-mode, and pinned
  comment threads.
- **Export:** download the board (or a selection) as PNG or SVG.

### Configuration

All optional — unset values degrade gracefully to single-instance, in-memory, open-access dev:

| Env var | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres for durable boards + room metadata |
| `AUTH_SECRET` | HMAC secret for room share-link tokens (required in prod) |
| `REDIS_URL` | Redis for cross-instance fan-out (required when scaling > 1) |

## Develop

```sh
pnpm install
pnpm dev          # server on :3000, web on :5173 (Vite proxies /yjs → server)
```

Open two browser windows on the same `/board/<id>` URL to watch edits sync.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Deploy

A multi-stage `Dockerfile` builds the web client and bundles the server; the
server serves both from `:3000`. Pushed to [Fly.io](https://fly.io) on every
`main` push via `.github/workflows/fly-deploy.yml`.
