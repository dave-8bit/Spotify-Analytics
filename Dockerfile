# ============================================================================
# Spotify Analytics — production image (single process, ROLE=all)
# ----------------------------------------------------------------------------
# Multi-stage build:
#   1. "client"  — build the React/Vite static bundle into client/dist.
#   2. "server"  — install server deps, run `prisma generate`, compile TS.
#   3. "runtime" — copy the compiled server + client/dist, apply outstanding
#                  migrations (`prisma migrate deploy`), then start
#                  `node dist/server.js`.
# The app is deployed as ONE process (API + WebSocket + scheduler) behind a
# single origin. PostgreSQL is expected to be external (managed Neon) — no
# database container is shipped here.
# ============================================================================

# ---- Stage 1: build the client ----
FROM node:20-alpine AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Stage 2: build the server ----
FROM node:20-alpine AS server
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
# Generate the Prisma client from the committed schema before compiling.
# (npm ci already runs the @prisma/client postinstall generate; this is
# explicit so the build never relies on postinstall side effects.)
RUN npm run build:prisma
RUN npm run build

# ---- Stage 3: runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV ROLE=all

# Full node_modules from the server stage: contains production deps + the
# prisma CLI (dev dep) needed for `prisma migrate deploy`, plus the generated
# Prisma client under node_modules/.prisma.
COPY --from=server /app/server/node_modules ./server/node_modules
COPY --from=server /app/server/package.json ./server/package.json
COPY --from=server /app/server/prisma ./server/prisma
COPY --from=server /app/server/dist ./server/dist
COPY --from=client /app/client/dist ./client/dist

WORKDIR /app/server
EXPOSE 5000

# Apply additive migrations, then start the single all-in-one process.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
