# Production Readiness Phase P1 — Implementation Checklist

**Status Symbols:** `[ ]` pending · `[x]` done

## Deploy wiring & production build setup

- [x] 1. Add Express static serving + SPA fallback in `server/src/app.ts`
       (exclude `/api`, `/auth`, `/health`, `/socket.io`; only production).
- [x] 2. Add Prisma build/deploy scripts in `server/package.json`
       (`build:prisma`, `migrate:deploy`, and generate in `build`).
- [x] 3. Add committed root `.env.example` with all env vars + safe placeholders.
- [x] 4. Add `Dockerfile` (multi-stage: client build → server build → runtime, ROLE=all).
- [x] 5. Add `.dockerignore`.
- [x] 6. Verify server typecheck/build (`npm run build`).
- [x] 7. Verify client typecheck/build (`npm run build`).
- [x] 8. Verify production server serves `client/dist` + SPA fallback behavior.
- [x] 9. Verify Prisma generate + `migrate deploy` commands.
