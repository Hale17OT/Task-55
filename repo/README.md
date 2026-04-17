# StudioOps — Offline Photo & Video Service Platform

**Project Type:** `fullstack` (Fastify API + Angular web app, fully containerized)

Local-network platform for photography and videography teams to manage service offerings, client access, portfolios, and performance insights. Zero internet dependency. Runs entirely inside Docker — no local Node.js, FFmpeg, or other runtime installs required.

## Roles

- **Guest** — View public offerings
- **Client** — View public + granted restricted offerings, register for events
- **Merchant** — Manage packages, upload media, curate portfolios, create events
- **Operations** — View dashboards/analytics (org-scoped), review data quality, manage dedup
- **Administrator** — Full system access: roles, rules, config, sessions, audit

## Prerequisites

- Docker 24+ and Docker Compose

## Quick Start

```bash
cp .env.example .env
# REQUIRED: Edit .env and set real values for DB_PASSWORD, JWT_SECRET, and ENCRYPTION_KEY
docker-compose up
```

The first run builds images automatically; the database, API, and web app all start as containers. No `npm install`, no local Node, no local FFmpeg.

### Access

- **Frontend (web app)**: http://localhost:4200
- **API base URL**: http://localhost:3100/api/v1
- **API health endpoint**: http://localhost:3100/api/v1/health

### Verify the App Is Working

After `docker-compose up` reports all services healthy, run these verification steps in order. Each step has an explicit expected result:

1. **API health check** — confirms the API container is reachable:
   ```bash
   curl http://localhost:3100/api/v1/health
   ```
   Expected: HTTP 200 with JSON `{"status":"ok"}` (or similar healthy payload).

2. **Frontend reachable** — confirms the web container is serving:
   ```bash
   curl -I http://localhost:4200
   ```
   Expected: HTTP 200 and an `index.html` response.

3. **Login as the seeded admin** — confirms DB seeding and auth work end-to-end:
   ```bash
   curl -X POST http://localhost:3100/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"AdminPass123!@"}'
   ```
   Expected: HTTP 200 with a JSON body containing `accessToken` and `refreshToken`.

4. **List offerings as a guest** — confirms read paths work:
   ```bash
   curl http://localhost:3100/api/v1/offerings
   ```
   Expected: HTTP 200 with `{"data":[...]}` (array of public offerings after seeding).

5. **UI smoke test** — open http://localhost:4200 in a Chromium browser, click **Login**, and sign in as `admin` / `AdminPass123!@`. Expected: redirect to the dashboard with navigation visible (Offerings, Portfolio, Events, Analytics).

If all five steps pass, the stack is up and verified.

### First-Run Seeding

Demo data is seeded automatically when `SEED_DATA=true` is set in the api service environment (default in the bundled `docker-compose.yml`). Seeding is **opt-in** and disabled by default for production safety.

### Seed Accounts (Development Only)

| Role | Username | Password |
|------|----------|----------|
| Guest | _(no credentials)_ | **No authentication required** — anonymous requests can hit public endpoints (e.g. `GET /api/v1/offerings`) |
| Administrator | admin | AdminPass123!@ |
| Operations | ops_user | OpsUserPass123!@ |
| Merchant | merchant1 | MerchantPass123!@ |
| Client | client1 | ClientPass123!@ |

The **Guest** role represents unauthenticated visitors. No credentials are issued or required; simply omit the `Authorization` header to act as a guest.

> **Security:** These are well-known default credentials for local development only. After first login, change all seed account passwords immediately. Do not use seed credentials in production without resetting them.

## Testing

All tests run inside Docker against a real PostgreSQL database and live API — no local Node or test-runner setup required.

```bash
docker-compose --env-file .env.test --profile test up --build --abort-on-container-exit --exit-code-from test-runner
```

This starts DB + API + Web + test-runner containers, seeds the database, and runs the full unit / integration / E2E suite in strict CI mode (no skipped stages). Exit code 0 means all tests passed.

## Architecture

Hexagonal (Ports & Adapters) architecture:

```
API Layer (Fastify routes, hooks, schemas)
  └── thin HTTP handlers → call use cases → format output
Core Layer (framework-independent)
  ├── domain/    Entities, value objects, domain services
  ├── ports/     Interface definitions (repository, crypto, media)
  └── use-cases/ Application orchestration logic
Infrastructure Layer (adapters implementing ports)
  ├── persistence/  Drizzle ORM repositories
  ├── crypto/       Argon2id, AES-256-GCM
  ├── media/        Sharp (photos), FFmpeg (videos)
  └── export/       CSV, Excel generation
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Angular 21, Spartan UI, Tailwind CSS |
| Backend | Fastify 5, TypeScript, Zod |
| Database | PostgreSQL 16, Drizzle ORM |
| Auth | Argon2id, JWT (30min access + 8hr refresh) |
| Testing | Vitest (unit/integration), Playwright (E2E) |
| Container | Docker, Docker Compose |

## API Endpoints

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/register` | No | Register new user |
| POST | `/api/v1/auth/login` | No | Login, get tokens |
| POST | `/api/v1/auth/refresh` | No | Refresh token rotation |
| POST | `/api/v1/auth/logout` | Yes | Revoke tokens |
| GET | `/api/v1/auth/session` | Yes | Current session info |

### Offerings
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/offerings` | Merchant | Create offering |
| GET | `/api/v1/offerings` | Optional | List (visibility-filtered) |
| GET | `/api/v1/offerings/:id` | Optional | Get with addons |
| PUT | `/api/v1/offerings/:id` | Merchant | Update |
| PATCH | `/api/v1/offerings/:id/status` | Merchant | Change status |
| POST | `/api/v1/offerings/:id/addons` | Merchant | Add addon |
| DELETE | `/api/v1/offerings/:id/addons/:addonId` | Merchant | Remove addon |
| POST | `/api/v1/offerings/:id/access` | Merchant | Grant restricted access |
| DELETE | `/api/v1/offerings/:id/access/:userId` | Merchant | Revoke access |

### Events & Registrations
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/events` | Merchant | Create event |
| GET | `/api/v1/events` | Yes | List events |
| GET | `/api/v1/events/:id` | Yes | Get event |
| PUT | `/api/v1/events/:id` | Merchant | Update event |
| PATCH | `/api/v1/events/:id/status` | Merchant | Change status |
| POST | `/api/v1/events/:eventId/registrations` | Yes | Register for event |
| GET | `/api/v1/events/:eventId/registrations` | Yes | List registrations |
| PATCH | `/api/v1/events/registrations/:id/status` | Merchant/Ops | Update registration |

### Portfolio
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/portfolio/upload` | Merchant | Upload photo/video |
| GET | `/api/v1/portfolio` | Yes | List items |
| GET | `/api/v1/portfolio/:id` | Yes | Get item with tags |
| DELETE | `/api/v1/portfolio/:id` | Merchant | Soft delete |
| PATCH | `/api/v1/portfolio/:id/tags` | Merchant | Update tags |
| PATCH | `/api/v1/portfolio/:id/category` | Merchant | Assign category |
| GET | `/api/v1/portfolio/tags` | Yes | List tags |
| GET | `/api/v1/portfolio/categories` | Yes | List categories |
| POST | `/api/v1/portfolio/categories` | Merchant | Create category |
| PUT | `/api/v1/portfolio/categories/:categoryId` | Merchant | Update category |
| DELETE | `/api/v1/portfolio/categories/:categoryId` | Merchant | Delete category |

### Media
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/media/*` | Yes | Serve processed/preview files (org-scoped) |

### Analytics
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/analytics/dashboard` | Ops/Admin | Dashboard metrics |
| POST | `/api/v1/analytics/export` | Ops/Admin | Export CSV/Excel |

### Data Quality & Dedup
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/dedup/queue` | Ops/Admin | Dedup candidates |
| GET | `/api/v1/dedup/:candidateId` | Ops/Admin | Candidate details |
| POST | `/api/v1/dedup/:candidateId/merge` | Ops/Admin | Merge records |
| POST | `/api/v1/dedup/:candidateId/dismiss` | Ops/Admin | Dismiss candidate |
| GET | `/api/v1/dedup/data-quality/flags` | Ops/Admin | Quality flags |
| POST | `/api/v1/dedup/data-quality/flags/:id/resolve` | Ops/Admin | Resolve flag |

### Admin
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/admin/roles` | Admin | Permission matrix |
| PUT | `/api/v1/admin/roles/:roleId/permissions` | Admin | Update permissions |
| GET | `/api/v1/admin/rules` | Admin | List rules |
| POST | `/api/v1/admin/rules` | Admin | Create rule |
| PUT | `/api/v1/admin/rules/:id` | Admin | Update rule |
| DELETE | `/api/v1/admin/rules/:id` | Admin | Delete rule |
| GET | `/api/v1/admin/audit` | Admin | Audit log viewer |
| GET | `/api/v1/admin/config` | Admin | Config (masked) |
| PUT | `/api/v1/admin/config/:key` | Admin | Store config |
| POST | `/api/v1/admin/config/:key/reveal` | Admin | Reveal (re-auth) |
| GET | `/api/v1/admin/sessions` | Admin | Active sessions |
| DELETE | `/api/v1/admin/sessions/:sessionId` | Admin | Revoke session |
| GET | `/api/v1/admin/whitelist` | Admin | List rule whitelist |
| POST | `/api/v1/admin/whitelist` | Admin | Grant whitelist bypass |
| DELETE | `/api/v1/admin/whitelist/:id` | Admin | Revoke whitelist |
| GET | `/api/v1/admin/org-members` | Admin | List org memberships |
| POST | `/api/v1/admin/org-members` | Admin | Assign user to org |
| DELETE | `/api/v1/admin/org-members/:orgId/:userId` | Admin | Remove from org |

### Import & Cleansing
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/import/offerings` | Merchant | Bulk import offerings |
| POST | `/api/v1/import/cleanse` | Ops/Admin | Run internal-feed cleansing |

## Browser Requirement

- **Export to user-selected folder**: Uses the File System Access API (`showSaveFilePicker`) to save CSV/Excel files to a user-selected local folder. This requires **Chrome 86+ or Edge 86+** (Chromium-based). The export buttons are disabled in unsupported browsers with a notice. This is an offline local-network platform; Chromium is the supported deployment browser.

## Environment Variables

See `.env.example` for all required variables with descriptions.
