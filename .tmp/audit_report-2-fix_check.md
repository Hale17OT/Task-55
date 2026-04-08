# Recheck Results for Previously Reported Issues

Date: 2026-04-08  
Mode: Static-only verification (no runtime execution)

## 1) High - Unsafe automatic schema push with `--force` on API startup
- **Current status:** **Fixed**
- **Evidence:** `apps/api/docker-entrypoint.sh:8`, `apps/api/docker-entrypoint.sh:10`, `apps/api/docker-entrypoint.sh:13`
- **Reasoning:** Startup is now environment-gated; production runs versioned migrations and no longer uses `push --force`.

## 2) High - Audit log durability for protected reads/failures was best-effort
- **Current status:** **Fixed (static evidence)**
- **Evidence:** `apps/api/src/infrastructure/plugins/audit-log.ts:81`, `apps/api/src/infrastructure/plugins/audit-log.ts:87`, `apps/api/src/infrastructure/plugins/audit-log.ts:94`, `apps/api/src/infrastructure/plugins/audit-log.ts:105`
- **Reasoning:** Fail-closed behavior is implemented in `onSend`; if audit persistence fails after retries, the hook throws before response delivery.
- **Boundary:** Runtime confirmation under network/transport edge cases is still **Manual Verification Required**.

## 3) Medium - Audit retention enforcement depended on in-process scheduler only
- **Current status:** **Fixed**
- **Evidence:** `apps/api/src/infrastructure/plugins/audit-retention.ts:28`, `apps/api/src/infrastructure/plugins/audit-retention.ts:80`, `docker-compose.yml:58`, `docker-compose.yml:65`, `packages/db/src/purge-audit.ts:3`
- **Reasoning:** Retention scheduling is externalized via dedicated cron service and standalone purge script; plugin keeps callable purge + telemetry.

## 4) Medium - Refresh token accepted via request body increases exposure surface
- **Current status:** **Fixed (production posture)**
- **Evidence:** `apps/api/src/api/routes/auth.ts:129`, `apps/api/src/api/routes/auth.ts:131`, `apps/api/src/api/routes/auth.ts:132`
- **Reasoning:** Production mode accepts cookie token only; body token is disabled in production.

## 5) Medium - API base interceptor existed but was not wired
- **Current status:** **Fixed**
- **Evidence:** `apps/web/src/app/app.config.ts:7`, `apps/web/src/app/app.config.ts:15`
- **Reasoning:** `apiBaseInterceptor` is now registered in `withInterceptors(...)`.

## 6) Low - Visual design was generic for a multi-role product surface
- **Current status:** **Partially fixed**
- **Evidence:** `apps/web/src/styles.scss:25`, `apps/web/src/styles.scss:31`, `apps/web/src/app/features/home/home.component.ts:13`, `apps/web/src/app/features/home/home.component.ts:29`
- **Reasoning:** Visual hierarchy tokens and richer role-oriented hero/cards are present; static review still cannot confirm full cross-app visual polish.

---

## Summary
- **Fixed:** #1, #2, #3, #4, #5
- **Partially fixed:** #6
- **Not fixed:** none
