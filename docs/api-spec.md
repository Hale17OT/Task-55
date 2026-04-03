# StudioOps API Specification

## Overview
- Base URL: `/api/v1`
- Style: REST JSON API with role-based authorization and org-scoped data access.
- Primary capabilities: authentication/session management, offerings, events/registrations, portfolio/media, analytics/export, data quality/dedup, and admin controls.
- Verification status from acceptance audit: unit/build validated; DB-backed integration and full E2E flows require live infra for complete confirmation.

## Authentication and Session Model
- Auth mechanism: JWT-based access + refresh tokens.
- Password handling: Argon2id hashing and policy-based password checks.
- Session/security controls: lockout thresholds, token refresh rotation, logout/revocation, active session inspection (admin).

### Auth Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | No | Register user |
| POST | `/auth/login` | No | Login and receive tokens |
| POST | `/auth/refresh` | No | Rotate/refresh access token |
| POST | `/auth/logout` | Yes | Revoke current token/session |
| GET | `/auth/session` | Yes | Return current session details |

## Authorization Model
- Roles: `guest`, `client`, `merchant`, `operations`, `administrator`.
- Route protection: authenticated routes use auth middleware plus RBAC checks.
- Object-level access: ownership/org membership checks are applied on sensitive resources (offerings, events, portfolio, media).
- Tenant isolation: org scope propagates into analytics and dedup workflows.

## Resource APIs

### Offerings
| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/offerings` | Merchant | Create offering |
| GET | `/offerings` | Optional | List offerings (visibility-filtered) |
| GET | `/offerings/:id` | Optional | Get offering details |
| PUT | `/offerings/:id` | Merchant | Update offering |
| PATCH | `/offerings/:id/status` | Merchant | Change status |
| POST | `/offerings/:id/addons` | Merchant | Add addon |
| DELETE | `/offerings/:id/addons/:addonId` | Merchant | Remove addon |
| POST | `/offerings/:id/access` | Merchant | Grant restricted access |
| DELETE | `/offerings/:id/access/:userId` | Merchant | Revoke restricted access |

### Events and Registrations
| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/events` | Merchant | Create event |
| GET | `/events` | Authenticated | List events |
| GET | `/events/:id` | Authenticated | Get event details |
| PUT | `/events/:id` | Merchant | Update event |
| PATCH | `/events/:id/status` | Merchant | Change status |
| POST | `/events/:eventId/registrations` | Authenticated | Register for event |
| GET | `/events/:eventId/registrations` | Authenticated | List registrations |
| PATCH | `/events/registrations/:id/status` | Merchant/Ops | Update registration status |

### Portfolio and Media
| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/portfolio/upload` | Merchant | Upload photo/video |
| GET | `/portfolio` | Authenticated | List portfolio items |
| GET | `/portfolio/:id` | Authenticated | Get item details |
| DELETE | `/portfolio/:id` | Merchant | Soft delete item |
| PATCH | `/portfolio/:id/tags` | Merchant | Update tags |
| GET | `/portfolio/tags` | Authenticated | List tags |
| GET | `/portfolio/categories` | Authenticated | List categories |

### Analytics and Export
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/analytics/dashboard` | Ops/Admin | Dashboard metrics |
| POST | `/analytics/export` | Ops/Admin | Export CSV/Excel |

### Data Quality and Dedup
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/dedup/queue` | Ops/Admin | List dedup candidates |
| GET | `/dedup/:candidateId` | Ops/Admin | Candidate details |
| POST | `/dedup/:candidateId/merge` | Ops/Admin | Merge candidate |
| POST | `/dedup/:candidateId/dismiss` | Ops/Admin | Dismiss candidate |
| GET | `/dedup/data-quality/flags` | Ops/Admin | List data quality flags |
| POST | `/dedup/data-quality/flags/:id/resolve` | Ops/Admin | Resolve quality flag |

### Administration
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/admin/roles` | Admin | Permission matrix |
| PUT | `/admin/roles/:roleId/permissions` | Admin | Update permissions |
| GET | `/admin/rules` | Admin | List rules |
| POST | `/admin/rules` | Admin | Create rule |
| PUT | `/admin/rules/:id` | Admin | Update rule |
| DELETE | `/admin/rules/:id` | Admin | Delete rule |
| GET | `/admin/audit` | Admin | View audit events |
| GET | `/admin/config` | Admin | List masked config values |
| PUT | `/admin/config/:key` | Admin | Store/update config value |
| POST | `/admin/config/:key/reveal` | Admin | Reveal encrypted config (re-auth) |
| GET | `/admin/sessions` | Admin | List active sessions |
| DELETE | `/admin/sessions/:sessionId` | Admin | Revoke active session |

## Error and Validation Behavior
- Request validation is schema-driven (Zod/Fastify schemas).
- Centralized error handling is used to normalize API failures.
- Expect common HTTP classes: `400` validation, `401` unauthenticated, `403` unauthorized, `404` not found, `409` conflict, `429` throttling, `5xx` server errors.

## Non-Functional Notes
- Offline-first/local-network deployment target.
- Exports support CSV and Excel output.
- Media processing pipeline includes image and video handling.
- Security/audit posture includes logging with redaction and admin audit retention.

## Acceptance Notes
- This spec reflects documented and implemented routes reviewed in the audit.
- For release acceptance, run strict mode tests with DB/API available so integration and E2E stages cannot skip.
