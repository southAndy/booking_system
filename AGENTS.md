# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm run start:dev          # watch-mode dev server (NestJS)
npm run start:debug        # watch + --inspect
npm run build              # nest build → dist/
npm run start:prod         # node dist/main

npm run lint               # eslint --fix on src + test
npm run format             # prettier on src + test

npm test                   # jest (unit, *.spec.ts under src/)
npm run test:watch
npm run test:cov
npm run test:e2e           # uses test/jest-e2e.json
npx jest path/to/file.spec.ts            # run a single test file
npx jest -t "pattern"                    # run tests matching name

# TypeORM (data-source: src/database/data-source.ts)
npm run migration:run
npm run migration:revert
npm run migration:generate -- src/database/migrations/<Name>
npm run migration:create  -- src/database/migrations/<Name>
```

DB bootstrap requires PostgreSQL with `uuid-ossp` and `btree_gist` extensions; the Init migration creates them. `.env` is validated against `src/config/env.schema.ts` (zod) at boot — missing/invalid vars fail fast.

## Architecture

NestJS 10 + TypeORM 0.3 + PostgreSQL. Layout: `src/modules/{auth,users,resources,bookings}` (controller / service / dto / entities), `src/common/` (cross-cutting), `src/config/` (env + TypeORM), `src/database/` (data-source + migrations), `src/health/` (terminus).

Two architectural pieces span multiple files and are easy to break:

**1. Booking overlap protection (DB-enforced, app-mirrored).** `bookings.period` is a `tstzrange`. The Init migration adds `EXCLUDE USING gist (resource_id WITH =, period WITH &&) WHERE (status = 'confirmed')` named `no_overlap`. `BookingsService.create` does an app-level overlap check first for a friendly 409, then catches `QueryFailedError` with pg code `23P01` (or constraint `no_overlap`) as the race-condition fallback. Any change to booking semantics (statuses, soft-delete-as-free-slot, multi-capacity) must touch BOTH the migration's `EXCLUDE … WHERE` clause AND the service's overlap query — keeping them in sync is the invariant.

**2. Idempotency.** `POST /bookings` accepts `Idempotency-Key` header. Enforced by partial unique index `uq_bookings_idempotency` on `(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`. The service checks for an existing row first; on race, it catches pg `23505` with that constraint name and re-reads. Don't drop the partial-`WHERE` — keys are nullable for non-idempotent calls.

**3. Auth is secure-by-default.** `JwtAuthGuard` is registered as a global `APP_GUARD` in `app.module.ts`. Endpoints are protected unless decorated with `@Public()` (`src/common/decorators/public.decorator.ts`). Refresh flow uses a separate `JwtRefreshGuard` and a different secret (`JWT_REFRESH_SECRET`). When adding a new controller, the default is "requires JWT" — only mark `@Public()` deliberately. Use `@CurrentUser()` to get the authenticated user from the request.

**4. Global response/error envelope.** `TransformInterceptor` (APP_INTERCEPTOR) wraps successful responses; `AllExceptionsFilter` (APP_FILTER) shapes errors. Curl/Swagger output goes through both — when reading `data.tokens.accessToken` etc. in the README's smoke test, that envelope is why.

**5. Throttling.** `ThrottlerGuard` is registered globally (60 req/min default in `app.module.ts`). Auth login has a tighter limit applied via `@Throttle` on the route.

**6. Config flow.** `ConfigModule.forRoot({ validate })` runs `validateEnv` (zod) then merges `buildConfig(env)` so `config.get<AppConfig>('app')` returns a typed namespaced config. TypeORM uses `typeOrmAsyncConfig` (DI'd from ConfigService) at runtime, while migrations use the standalone `src/database/data-source.ts` (loads `.env` directly via dotenv) — both must point at the same DB and entity glob.

## Conventions worth knowing

- Entity column names are snake_case in DB, camelCase in TS — TypeORM mapping is explicit per-column, not via a global naming strategy. Match this when adding columns.
- `migrations` are hand-written SQL via `q.query(...)` (see `1714800000000-Init.ts`). Don't rely on `synchronize` — it's off.
- Soft-delete columns (`deleted_at`) exist on users/resources/bookings but the booking overlap constraint is filtered by `status = 'confirmed'`, not by `deleted_at`. Cancelling (status flip) is what frees a slot.
