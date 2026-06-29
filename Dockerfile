# Multi-stage build: install + build the whole monorepo, then run the WebSocket
# server which also serves the built web client from a single origin (one port,
# no CORS, and the ws upgrade and SPA share the same host).
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @coalesce/web build
RUN pnpm --filter @coalesce/server build

FROM base AS runtime
ENV NODE_ENV=production
# Copy the fully-installed, built workspace (node_modules carries yjs, ws, and
# the rest of the server's runtime deps, which tsup leaves external).
COPY --from=build /app /app
ENV WEB_DIST=/app/apps/web/dist
ENV PORT=3000
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
