# StudioOps — Offline Photo & Video Service Platform

Local-network platform for photography and videography teams to manage service offerings, client access, portfolios, and performance insights. Zero internet dependency.

## Roles

- **Guest** — View public offerings
- **Client** — View public + granted restricted offerings, register for events
- **Merchant** — Manage packages, upload media, curate portfolios, create events
- **Operations** — View dashboards/analytics (org-scoped), review data quality, manage dedup
- **Administrator** — Full system access: roles, rules, config, sessions, audit

## Prerequisites

- Docker 24+ and Docker Compose v2
- Node.js 20+ (for local development)
- FFmpeg (for local development — video processing requires `ffmpeg` and `ffprobe` on PATH; included in Docker image)

## Quick Start

```bash
cp .env.example .env
# REQUIRED: Edit .env and set real values for DB_PASSWORD, JWT_SECRET, and ENCRYPTION_KEY
docker compose up --build
```

- **Frontend**: http://localhost:4200 (also proxies `/api` to the API)
- **API**: http://localhost:3100/api/v1/health (Docker maps container port 3000 → host port 3100)

### First-Run Setup

On first deployment, seed the database with demo data by adding `SEED_DATA=true` to the api service environment (or run the seed script manually). Seeding is **opt-in** and disabled by default for production safety.

### Seed Accounts (Development Only)

| Role | Username | Password |
|------|----------|----------|
| Administrator | admin | AdminPass123!@ |
| Operations | ops_user | OpsUserPass123!@ |
| Merchant | merchant1 | MerchantPass123!@ |
| Client | client1 | ClientPass123!@ |

> **Security:** These are well-known default credentials for local development only. After first login, change all seed account passwords immediately. Do not use seed credentials in production without resetting them.

## Development (Local)

```bash
npm install
npm run build -w packages/shared -w packages/db

# Start DB
docker compose up db -d

# Push schema + apply triggers + seed
cd packages/db
DATABASE_URL="postgres://studioops:dev_password_change_me@127.0.0.1:54320/studioops" npx drizzle-kit push --force
DATABASE_URL="postgres://studioops:dev_password_change_me@127.0.0.1:54320/studioops" npx tsx src/apply-triggers.ts
DATABASE_URL="postgres://studioops:dev_password_change_me@127.0.0.1:54320/studioops" npx tsx src/seed-full.ts

# Start API
cd apps/api
DATABASE_URL="postgres://studioops:dev_password_change_me@127.0.0.1:54320/studioops" npx tsx src/index.ts

# Start Angular (proxies /api to localhost:3100 via proxy.conf.json)
cd apps/web && npx ng serve
```

## Testing

### Run all tests in Docker (recommended)

Runs the entire test suite — unit, integration, and E2E — inside Docker with a real PostgreSQL database and live API:

```bash
npm run test:docker
```

This starts DB + API + Web + test-runner, seeds the database, and runs all tests in strict CI mode (no skipped stages). Exit code 0 means all tests passed.

### Local testing (without Docker)

```bash
npm test              # Runs unit → integration (if DB up) → build → E2E (if API up)
```

Integration and E2E stages skip gracefully when their infrastructure is unavailable. To run everything locally without Docker, start the DB and API first, then:

```bash
CI=true DATABASE_URL="postgres://studioops:...@localhost:54320/studioops" API_URL="http://localhost:3100" npm test
```

This will exit non-zero if integration or E2E stages cannot run.

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

## API Endpoints (51 routes)

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
| GET | `/api/v1/portfolio/tags` | Yes | List tags |
| GET | `/api/v1/portfolio/categories` | Yes | List categories |

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

## Browser Requirement

- **Export to user-selected folder**: Uses the File System Access API (`showSaveFilePicker`) to save CSV/Excel files to a user-selected local folder. This requires **Chrome 86+ or Edge 86+** (Chromium-based). The export buttons are disabled in unsupported browsers with a notice. This is an offline local-network platform; Chromium is the supported deployment browser.

## Environment Variables

See `.env.example` for all required variables with descriptions.
