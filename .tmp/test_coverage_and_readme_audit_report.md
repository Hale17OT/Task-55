# Test Coverage Audit

## Scope & Method
- Audit type: static inspection only (no test execution, no runtime verification).
- Code inspected: API routes under `apps/api/src/api/routes/*.ts`, API tests under `apps/api/test/**/*`, root test runner `run_tests.sh`, selected Playwright config/specs for fullstack expectation checks.

## Backend Endpoint Inventory

Resolved from route prefixes in `apps/api/src/app.ts:94-103` and handler declarations in `apps/api/src/api/routes/*.ts`.

1. `GET /api/v1/health`
2. `POST /api/v1/auth/register`
3. `POST /api/v1/auth/login`
4. `POST /api/v1/auth/refresh`
5. `POST /api/v1/auth/logout`
6. `GET /api/v1/auth/session`
7. `DELETE /api/v1/auth/sessions/:userId`
8. `POST /api/v1/offerings`
9. `GET /api/v1/offerings`
10. `GET /api/v1/offerings/:id`
11. `PUT /api/v1/offerings/:id`
12. `PATCH /api/v1/offerings/:id/status`
13. `POST /api/v1/offerings/:id/addons`
14. `DELETE /api/v1/offerings/:id/addons/:addonId`
15. `POST /api/v1/offerings/:id/access`
16. `DELETE /api/v1/offerings/:id/access/:userId`
17. `POST /api/v1/events`
18. `GET /api/v1/events`
19. `GET /api/v1/events/:id`
20. `PUT /api/v1/events/:id`
21. `PATCH /api/v1/events/:id/status`
22. `POST /api/v1/events/:eventId/registrations`
23. `GET /api/v1/events/:eventId/registrations`
24. `PATCH /api/v1/events/registrations/:id/status`
25. `POST /api/v1/portfolio/upload`
26. `GET /api/v1/portfolio`
27. `GET /api/v1/portfolio/:id`
28. `DELETE /api/v1/portfolio/:id`
29. `PATCH /api/v1/portfolio/:id/tags`
30. `GET /api/v1/portfolio/tags`
31. `GET /api/v1/portfolio/categories`
32. `POST /api/v1/portfolio/categories`
33. `PUT /api/v1/portfolio/categories/:categoryId`
34. `DELETE /api/v1/portfolio/categories/:categoryId`
35. `PATCH /api/v1/portfolio/:id/category`
36. `GET /api/v1/dedup/queue`
37. `GET /api/v1/dedup/:candidateId`
38. `POST /api/v1/dedup/:candidateId/merge`
39. `POST /api/v1/dedup/:candidateId/dismiss`
40. `GET /api/v1/dedup/data-quality/flags`
41. `POST /api/v1/dedup/data-quality/flags/:id/resolve`
42. `GET /api/v1/analytics/dashboard`
43. `POST /api/v1/analytics/export`
44. `GET /api/v1/admin/roles`
45. `PUT /api/v1/admin/roles/:roleId/permissions`
46. `GET /api/v1/admin/rules`
47. `POST /api/v1/admin/rules`
48. `PUT /api/v1/admin/rules/:id`
49. `DELETE /api/v1/admin/rules/:id`
50. `GET /api/v1/admin/audit`
51. `POST /api/v1/admin/audit/purge`
52. `GET /api/v1/admin/audit/retention-status`
53. `GET /api/v1/admin/config`
54. `PUT /api/v1/admin/config/:key`
55. `POST /api/v1/admin/config/:key/reveal`
56. `GET /api/v1/admin/sessions`
57. `DELETE /api/v1/admin/sessions/:sessionId`
58. `GET /api/v1/admin/whitelist`
59. `POST /api/v1/admin/whitelist`
60. `DELETE /api/v1/admin/whitelist/:id`
61. `GET /api/v1/admin/org-members`
62. `POST /api/v1/admin/org-members`
63. `DELETE /api/v1/admin/org-members/:orgId/:userId`
64. `POST /api/v1/import/offerings`
65. `POST /api/v1/import/cleanse`
66. `GET /api/v1/media/*`

## API Test Mapping Table

Legend:
- test type = `true no-mock HTTP` unless otherwise stated
- all listed tests use app bootstrap via `createTestApp` (`apps/api/test/helpers/build-test-app.ts:153-167`) and send HTTP requests through the real local TCP listener (`apps/api/test/helpers/build-test-app.ts:72-75`, `109-110`, `162-166`)

| Endpoint | Covered | Test type | Test files | Evidence (file + test ref) |
|---|---|---|---|---|
| `GET /api/v1/health` | yes | true no-mock HTTP | `health.test.ts` | `apps/api/test/integration/health.test.ts:5` (`describe('GET /api/v1/health')`) |
| `POST /api/v1/auth/register` | yes | true no-mock HTTP | `auth.test.ts` | `apps/api/test/integration/auth.test.ts:25` |
| `POST /api/v1/auth/login` | yes | true no-mock HTTP | `auth.test.ts` | `apps/api/test/integration/auth.test.ts:83` |
| `POST /api/v1/auth/refresh` | yes | true no-mock HTTP | `auth.test.ts` | `apps/api/test/integration/auth.test.ts:162` |
| `POST /api/v1/auth/logout` | yes | true no-mock HTTP | `auth.test.ts` | `apps/api/test/integration/auth.test.ts:348` |
| `GET /api/v1/auth/session` | yes | true no-mock HTTP | `auth.test.ts` | `apps/api/test/integration/auth.test.ts:309` |
| `DELETE /api/v1/auth/sessions/:userId` | yes | true no-mock HTTP | `auth.test.ts`, `coverage-fill-4.test.ts` | `apps/api/test/integration/auth.test.ts:404`; `apps/api/test/integration/coverage-fill-4.test.ts:324` |
| `POST /api/v1/offerings` | yes | true no-mock HTTP | `offerings.test.ts` | `apps/api/test/integration/offerings.test.ts:50` |
| `GET /api/v1/offerings` | yes | true no-mock HTTP | `offerings.test.ts` | `apps/api/test/integration/offerings.test.ts:98` |
| `GET /api/v1/offerings/:id` | yes | true no-mock HTTP | `offerings.test.ts` | `apps/api/test/integration/offerings.test.ts:132` |
| `PUT /api/v1/offerings/:id` | yes | true no-mock HTTP | `offerings.test.ts` | `apps/api/test/integration/offerings.test.ts:143` |
| `PATCH /api/v1/offerings/:id/status` | yes | true no-mock HTTP | `offerings.test.ts` | `apps/api/test/integration/offerings.test.ts:155` |
| `POST /api/v1/offerings/:id/addons` | yes | true no-mock HTTP | `offerings.test.ts` | `apps/api/test/integration/offerings.test.ts:216` |
| `DELETE /api/v1/offerings/:id/addons/:addonId` | yes | true no-mock HTTP | `offerings.test.ts` | `apps/api/test/integration/offerings.test.ts:230` |
| `POST /api/v1/offerings/:id/access` | yes | true no-mock HTTP | `offerings.test.ts` | `apps/api/test/integration/offerings.test.ts:306` |
| `DELETE /api/v1/offerings/:id/access/:userId` | yes | true no-mock HTTP | `offerings.test.ts` | `apps/api/test/integration/offerings.test.ts:325` |
| `POST /api/v1/events` | yes | true no-mock HTTP | `events.test.ts` | `apps/api/test/integration/events.test.ts:45` |
| `GET /api/v1/events` | yes | true no-mock HTTP | `events.test.ts` | `apps/api/test/integration/events.test.ts:105` |
| `GET /api/v1/events/:id` | yes | true no-mock HTTP | `events.test.ts` | `apps/api/test/integration/events.test.ts:115` |
| `PUT /api/v1/events/:id` | yes | true no-mock HTTP | `events.test.ts` | `apps/api/test/integration/events.test.ts:125` |
| `PATCH /api/v1/events/:id/status` | yes | true no-mock HTTP | `events.test.ts` | `apps/api/test/integration/events.test.ts:136` |
| `POST /api/v1/events/:eventId/registrations` | yes | true no-mock HTTP | `events.test.ts` | `apps/api/test/integration/events.test.ts:190` |
| `GET /api/v1/events/:eventId/registrations` | yes | true no-mock HTTP | `events.test.ts` | `apps/api/test/integration/events.test.ts:203` |
| `PATCH /api/v1/events/registrations/:id/status` | yes | true no-mock HTTP | `events.test.ts` | `apps/api/test/integration/events.test.ts:213` |
| `POST /api/v1/portfolio/upload` | yes | true no-mock HTTP | `portfolio.test.ts` | `apps/api/test/integration/portfolio.test.ts:68` |
| `GET /api/v1/portfolio` | yes | true no-mock HTTP | `portfolio.test.ts` | `apps/api/test/integration/portfolio.test.ts:111` |
| `GET /api/v1/portfolio/:id` | yes | true no-mock HTTP | `coverage-fill.test.ts` | `apps/api/test/integration/coverage-fill.test.ts:633` |
| `DELETE /api/v1/portfolio/:id` | yes | true no-mock HTTP | `coverage-fill.test.ts` | `apps/api/test/integration/coverage-fill.test.ts:652` |
| `PATCH /api/v1/portfolio/:id/tags` | yes | true no-mock HTTP | `coverage-fill.test.ts`, `security.test.ts` | `apps/api/test/integration/coverage-fill.test.ts:548`; `apps/api/test/integration/security.test.ts:359` |
| `GET /api/v1/portfolio/tags` | yes | true no-mock HTTP | `portfolio.test.ts` | `apps/api/test/integration/portfolio.test.ts:138` |
| `GET /api/v1/portfolio/categories` | yes | true no-mock HTTP | `portfolio.test.ts` | `apps/api/test/integration/portfolio.test.ts:150` |
| `POST /api/v1/portfolio/categories` | yes | true no-mock HTTP | `portfolio.test.ts` | `apps/api/test/integration/portfolio.test.ts:175` |
| `PUT /api/v1/portfolio/categories/:categoryId` | yes | true no-mock HTTP | `coverage-fill.test.ts` | `apps/api/test/integration/coverage-fill.test.ts:1606` |
| `DELETE /api/v1/portfolio/categories/:categoryId` | yes | true no-mock HTTP | `coverage-fill.test.ts` | `apps/api/test/integration/coverage-fill.test.ts:1616` |
| `PATCH /api/v1/portfolio/:id/category` | yes | true no-mock HTTP | `portfolio.test.ts` | `apps/api/test/integration/portfolio.test.ts:196` |
| `GET /api/v1/dedup/queue` | yes | true no-mock HTTP | `dedup.test.ts` | `apps/api/test/integration/dedup.test.ts:65` |
| `GET /api/v1/dedup/:candidateId` | yes | true no-mock HTTP | `dedup.test.ts` | `apps/api/test/integration/dedup.test.ts:86` |
| `POST /api/v1/dedup/:candidateId/merge` | yes | true no-mock HTTP | `dedup.test.ts` | `apps/api/test/integration/dedup.test.ts:102` |
| `POST /api/v1/dedup/:candidateId/dismiss` | yes | true no-mock HTTP | `dedup.test.ts` | `apps/api/test/integration/dedup.test.ts:227` |
| `GET /api/v1/dedup/data-quality/flags` | yes | true no-mock HTTP | `dedup.test.ts` | `apps/api/test/integration/dedup.test.ts:328` |
| `POST /api/v1/dedup/data-quality/flags/:id/resolve` | yes | true no-mock HTTP | `dedup.test.ts` | `apps/api/test/integration/dedup.test.ts:349` |
| `GET /api/v1/analytics/dashboard` | yes | true no-mock HTTP | `analytics.test.ts` | `apps/api/test/integration/analytics.test.ts:54` |
| `POST /api/v1/analytics/export` | yes | true no-mock HTTP | `analytics.test.ts` | `apps/api/test/integration/analytics.test.ts:105` |
| `GET /api/v1/admin/roles` | yes | true no-mock HTTP | `admin.test.ts` | `apps/api/test/integration/admin.test.ts:56` |
| `PUT /api/v1/admin/roles/:roleId/permissions` | yes | true no-mock HTTP | `admin.test.ts` | `apps/api/test/integration/admin.test.ts:66` |
| `GET /api/v1/admin/rules` | yes | true no-mock HTTP | `admin.test.ts` | `apps/api/test/integration/admin.test.ts:125` |
| `POST /api/v1/admin/rules` | yes | true no-mock HTTP | `admin.test.ts` | `apps/api/test/integration/admin.test.ts:92` |
| `PUT /api/v1/admin/rules/:id` | yes | true no-mock HTTP | `admin.test.ts` | `apps/api/test/integration/admin.test.ts:134` |
| `DELETE /api/v1/admin/rules/:id` | yes | true no-mock HTTP | `admin.test.ts` | `apps/api/test/integration/admin.test.ts:144` |
| `GET /api/v1/admin/audit` | yes | true no-mock HTTP | `admin.test.ts` | `apps/api/test/integration/admin.test.ts:167` |
| `POST /api/v1/admin/audit/purge` | yes | true no-mock HTTP | `coverage-fill-3.test.ts` | `apps/api/test/integration/coverage-fill-3.test.ts:268` |
| `GET /api/v1/admin/audit/retention-status` | yes | true no-mock HTTP | `coverage-fill-3.test.ts` | `apps/api/test/integration/coverage-fill-3.test.ts:278` |
| `GET /api/v1/admin/config` | yes | true no-mock HTTP | `admin.test.ts` | `apps/api/test/integration/admin.test.ts:198` |
| `PUT /api/v1/admin/config/:key` | yes | true no-mock HTTP | `admin.test.ts` | `apps/api/test/integration/admin.test.ts:188` |
| `POST /api/v1/admin/config/:key/reveal` | yes | true no-mock HTTP | `admin.test.ts` | `apps/api/test/integration/admin.test.ts:210` |
| `GET /api/v1/admin/sessions` | yes | true no-mock HTTP | `admin.test.ts` | `apps/api/test/integration/admin.test.ts:248` |
| `DELETE /api/v1/admin/sessions/:sessionId` | yes | true no-mock HTTP | `admin.test.ts` | `apps/api/test/integration/admin.test.ts:259` |
| `GET /api/v1/admin/whitelist` | yes | true no-mock HTTP | `coverage-fill.test.ts` | `apps/api/test/integration/coverage-fill.test.ts:98` |
| `POST /api/v1/admin/whitelist` | yes | true no-mock HTTP | `coverage-fill.test.ts` | `apps/api/test/integration/coverage-fill.test.ts:98` |
| `DELETE /api/v1/admin/whitelist/:id` | yes | true no-mock HTTP | `coverage-fill.test.ts` | `apps/api/test/integration/coverage-fill.test.ts:110` |
| `GET /api/v1/admin/org-members` | yes | true no-mock HTTP | `coverage-fill.test.ts` | `apps/api/test/integration/coverage-fill.test.ts:156` |
| `POST /api/v1/admin/org-members` | yes | true no-mock HTTP | `coverage-fill.test.ts` | `apps/api/test/integration/coverage-fill.test.ts:156` |
| `DELETE /api/v1/admin/org-members/:orgId/:userId` | yes | true no-mock HTTP | `coverage-fill.test.ts` | `apps/api/test/integration/coverage-fill.test.ts:188` |
| `POST /api/v1/import/offerings` | yes | true no-mock HTTP | `import.test.ts` | `apps/api/test/integration/import.test.ts:41` |
| `POST /api/v1/import/cleanse` | yes | true no-mock HTTP | `import.test.ts` | `apps/api/test/integration/import.test.ts:147` |
| `GET /api/v1/media/*` | yes | true no-mock HTTP | `security.test.ts` | `apps/api/test/integration/security.test.ts:243` |

## API Test Classification

### 1) True No-Mock HTTP
- Files (HTTP route tests via real socket):
  - `apps/api/test/integration/health.test.ts`
  - `apps/api/test/integration/auth.test.ts`
  - `apps/api/test/integration/offerings.test.ts`
  - `apps/api/test/integration/events.test.ts`
  - `apps/api/test/integration/portfolio.test.ts`
  - `apps/api/test/integration/dedup.test.ts`
  - `apps/api/test/integration/analytics.test.ts`
  - `apps/api/test/integration/admin.test.ts`
  - `apps/api/test/integration/import.test.ts`
  - `apps/api/test/integration/security.test.ts`
  - `apps/api/test/integration/audit.test.ts`
  - `apps/api/test/integration/audit-log-guards.test.ts`
  - `apps/api/test/integration/coverage-fill.test.ts`
  - `apps/api/test/integration/coverage-fill-2.test.ts`
  - `apps/api/test/integration/coverage-fill-3.test.ts`
  - `apps/api/test/integration/coverage-fill-4.test.ts`
  - `apps/api/test/integration/ops-out-of-scope.test.ts`
  - `apps/api/test/integration/rbac.test.ts`

### 2) HTTP with Mocking
- None found by static scan.

### 3) Non-HTTP (unit / direct integration)
- Direct non-HTTP integration:
  - `apps/api/test/integration/repository-direct.test.ts` (direct repository calls)
  - `apps/api/test/integration/check-permission-direct.test.ts` (direct use-case invocation)
  - `apps/api/test/integration/plugin-internals.test.ts` includes one direct decorator call (`purgeAuditLogs`)
- Unit tests:
  - `apps/api/test/unit/*.test.ts` (domain, crypto, media, config, etc.)

## Mock Detection (Strict Rules)

- Searched for `jest.mock`, `vi.mock`, `sinon.stub`, `vi.spyOn` under `apps/api/test/**/*.ts`.
- Result: no explicit mocking/stubbing constructs found.
- Evidence:
  - No match for mock APIs in test tree.
  - HTTP helper documents real TCP request path and overrides `app.inject` with fetch-based network calls (`apps/api/test/helpers/build-test-app.ts:72-75`, `143-147`, `162-166`).

## Coverage Summary

- Total endpoints: **66**
- Endpoints with HTTP tests: **66**
- Endpoints with true no-mock HTTP tests: **66**
- HTTP coverage: **100.0%**
- True API coverage: **100.0%**

## Unit Test Summary

- Unit test files (found):
  - `apps/api/test/unit/admin-schemas.test.ts`
  - `apps/api/test/unit/analytics.test.ts`
  - `apps/api/test/unit/app-builder.test.ts`
  - `apps/api/test/unit/argon2-hasher.test.ts`
  - `apps/api/test/unit/config.test.ts`
  - `apps/api/test/unit/encryption.test.ts`
  - `apps/api/test/unit/event.test.ts`
  - `apps/api/test/unit/export-service.test.ts`
  - `apps/api/test/unit/image-processor.test.ts`
  - `apps/api/test/unit/media-validation.test.ts`
  - `apps/api/test/unit/normalizers.test.ts`
  - `apps/api/test/unit/offering.test.ts`
  - `apps/api/test/unit/password-policy.test.ts`
  - `apps/api/test/unit/permissions.test.ts`
  - `apps/api/test/unit/refresh-token.test.ts`
  - `apps/api/test/unit/rules-engine-errors.test.ts`
  - `apps/api/test/unit/rules-engine.test.ts`
  - `apps/api/test/unit/similarity.test.ts`
  - `apps/api/test/unit/video-processor.test.ts`

- Modules covered (by category):
  - controllers/routes: mainly by integration HTTP tests, not classic isolated controller unit tests
  - services/use-cases: partial direct coverage (`check-permission-direct.test.ts`)
  - repositories: direct coverage in `repository-direct.test.ts`
  - auth/guards/middleware/plugins: integration coverage via protected endpoints and security suites (`auth.test.ts`, `rbac.test.ts`, `security.test.ts`, `audit-log-guards.test.ts`)

- Important modules not directly unit-tested (or only indirectly tested):
  - `apps/api/src/core/use-cases/register.ts`
  - `apps/api/src/core/use-cases/login.ts`
  - `apps/api/src/core/use-cases/refresh.ts`
  - `apps/api/src/core/use-cases/auto-cleanse.ts`
  - `apps/api/src/core/use-cases/enforce-quota.ts`
  - `apps/api/src/infrastructure/plugins/auth.ts`
  - `apps/api/src/infrastructure/plugins/rbac.ts`
  - `apps/api/src/infrastructure/plugins/rate-limit.ts`

## API Observability Check

- Strong in many suites: tests usually show explicit method/path, payload, and response assertions (e.g., `auth.test.ts`, `offerings.test.ts`, `events.test.ts`, `analytics.test.ts`).
- Weak spots exist: some tests assert only status code with minimal response-shape/content checks.
  - Example: several admin filter tests in `apps/api/test/integration/admin.test.ts:178-184` and `apps/api/test/integration/admin.test.ts:280-287` emphasize status/error only.
  - Example: some coverage-fill negative-path checks are status-centric (`apps/api/test/integration/coverage-fill.test.ts`, multiple sections).

## Tests Check

- Success paths: covered broadly across auth, offerings, events, portfolio, dedup, analytics, admin, import suites.
- Failure paths: covered broadly (validation, authn/authz, conflict, not-found, org-scope denial, invalid transitions).
- Edge cases: present (lockout, token rotation reuse, category ownership, dedup mismatch/self-merge, path traversal on media).
- Validation depth: generally strong in route-level scenarios; varies by endpoint.
- Integration boundaries: strong API-level route integration with real DB in test env; plus direct repository/use-case tests.
- Real assertions vs superficial:
  - strong: many tests assert body fields and behavior semantics
  - weak: non-trivial subset only validates status code
- Meaningful vs autogenerated: mostly meaningful, but `coverage-fill*.test.ts` are intentionally broad and sometimes shallow per-case.

### `run_tests.sh` policy check
- Docker path exists and is primary when services detected (`run_tests.sh:10-21`) — acceptable.
- Local fallback performs runtime installs/builds (`npm install`, local builds, local vitest/ng/playwright) at `run_tests.sh:24-75` — **FLAG** per strict Docker-contained requirement.

## End-to-End Expectations (Fullstack)

- Fullstack FE↔BE tests are present:
  - Browser project in Playwright config (`e2e/playwright.config.ts:19-28`)
  - Browser UI specs (`e2e/specs/browser-*.spec.ts`, example `e2e/specs/browser-dashboard.spec.ts:13-60`)
- API-only E2E project also exists (`e2e/playwright.config.ts:14-17`; example `e2e/specs/dashboard.spec.ts`).

## Test Coverage Score (0-100)

**92/100**

## Score Rationale

- + Full endpoint inventory appears HTTP-tested (66/66), with evidence across integration suites.
- + No static evidence of mocking/stubbing in API test execution paths.
- + Strong breadth on success/failure/authz/validation/edge conditions.
- + Additional non-HTTP repository/use-case tests increase domain coverage.
- - Not all assertions are deep (status-only checks in several tests).
- - Large `coverage-fill` suites concentrate many cases and reduce per-case readability/maintainability.
- - `run_tests.sh` includes non-Docker local fallback behavior contrary to strict container-only policy.

## Key Gaps

- Some endpoint tests lack strict response contract assertions (schema-level payload validation) and rely mainly on status code.
- Several core use-cases are not directly unit-tested (covered indirectly through HTTP).
- Test execution policy file (`run_tests.sh`) is not strictly Docker-only.

## Confidence & Assumptions

- Confidence: **high** for static route-to-test mapping and mock detection.
- Assumptions:
  - `createTestApp` behavior is as implemented (real socket HTTP requests).
  - No hidden mocking in external utilities outside inspected test files.
  - Dynamic template URLs in tests correspond to canonical parameterized endpoint paths.

---

# README Audit

## Project Type Detection

- Explicit project type label is present at `README.md:3` (`fullstack`).
- Inference is not required.

## README Location Check

- Required file exists: `README.md` at repository root.

## Hard Gate Evaluation

- Formatting/readability: **PASS** (structured markdown with sections/tables).
- Startup instructions (fullstack/backend must include `docker-compose up`): **PASS**
  - Required literal command is present (`README.md:24`).
- Access method (URL + port): **PASS**
  - Frontend and API URLs/ports are explicit (`README.md:31-33`).
- Verification method (explicit how to confirm app works): **PASS**
  - Concrete verification sequence with curl/UI expected outcomes is provided (`README.md:35-67`).
- Environment rules (no local runtime installs/manual setup): **PASS**
  - README is Docker-contained and explicitly states no local installs (`README.md:5`, `README.md:27`, `README.md:89-95`).
- Demo credentials when auth exists: **PASS**
  - Credentials are provided for authenticated roles (`README.md:78-81`).
  - Guest role explicitly states no credentials and no authentication required (`README.md:77`, `README.md:83`).

## Engineering Quality Assessment

- Tech stack clarity: strong (`README.md:112-121`).
- Architecture explanation: strong (`README.md:94-110`).
- Testing instructions: clear Docker-only flow (`README.md:84-93`).
- Security/roles guidance: present (`README.md:7-13`, `README.md:82`).
- Workflow clarity: high; startup + verification are deterministic (`README.md:21-67`).
- Presentation quality: good structure and endpoint documentation depth.

## High Priority Issues

- None.

## Medium Priority Issues

- None.

## Low Priority Issues

- None.

## Hard Gate Failures

- None.

## README Verdict

**PASS**

Rationale: all strict hard gates are satisfied (project type declaration, docker-compose startup, explicit access and verification steps, docker-contained environment guidance, and explicit guest no-auth plus authenticated-role credentials).
