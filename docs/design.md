# StudioOps Design

## Purpose
StudioOps is an offline, local-network platform for photo/video service teams. It supports service catalog management, client access control, event registration, media portfolio workflows, analytics exports, and administrative governance.

## Product Scope
- Public and restricted offerings by role and grant.
- Merchant-managed events with client registrations.
- Portfolio upload/tag/category management for media assets.
- Operations analytics and export tools.
- Administrator controls for permissions, rules, config, sessions, and audit visibility.

## Users and Access Model
- `Guest`: reads public offerings.
- `Client`: reads public/restricted offerings and registers for events.
- `Merchant`: manages offerings, events, and portfolio/media.
- `Operations`: views org-scoped analytics and handles data-quality/dedup queues.
- `Administrator`: full governance and security management.

## System Architecture
The platform follows a hexagonal (Ports and Adapters) design:

- API layer: Fastify routes/hooks/schemas; thin HTTP handlers.
- Core layer: domain entities, policies, and use-case orchestration.
- Infrastructure layer: adapters for persistence, crypto, media processing, and exports.

Design intent:
- Keep business logic framework-agnostic in core use cases.
- Isolate external dependencies (DB, crypto, FFmpeg, export engines) in adapters.
- Maintain explicit contracts through ports for testability and substitution.

## Technology Choices
- Frontend: Angular + Tailwind + Spartan UI for role-based operational UI.
- Backend: Fastify + TypeScript + Zod for typed route and payload handling.
- Data: PostgreSQL + Drizzle ORM.
- Security: Argon2id password hashing, JWT access/refresh flow, RBAC, audit logging.
- Media: Sharp for images; FFmpeg/ffprobe for videos.
- Testing: Vitest (unit/integration) and Playwright (E2E).

## Security Design
- Authentication: username/password flow with password policy and lockout windows.
- Authorization: route-level RBAC gates and object-level ownership/org checks.
- Sensitive config handling: encrypted storage with reveal gated by re-auth flow.
- Observability and compliance: structured logging with redaction and audit log support.

## Data and Isolation Strategy
- Organization scoping is propagated through request context.
- Analytics and dedup features are org-aware to avoid cross-tenant leakage.
- Resource ownership checks guard mutation endpoints.

## Runtime and Deployment Model
- Primary deployment path: Docker Compose (DB + API + Web + test runner).
- Local development path: Node runtime with separately started DB/API/Web.
- Browser baseline: Chromium-based browsers for File System Access API export workflows.

## Quality and Verification Design
- Layered test strategy:
  - Unit tests validate domain/use-case behavior.
  - Integration tests validate DB-backed auth/RBAC/security/data flows.
  - E2E tests validate browser role workflows.
- Acceptance audit result: partial pass because integration/E2E were not executable without active infrastructure during review.

## Known Delivery Risk and Mitigation
- Risk: non-strict local test command can pass while skipping integration/E2E stages.
- Mitigation:
  - Adopt strict acceptance mode (`CI=true`) for delivery gates.
  - Require one reproducible full-run artifact where unit, integration, and E2E all execute without skips.
  - Keep security-critical integration suites mandatory in release checks.

## Design Principles to Preserve
- Thin transport layer, rich core use cases.
- Security-by-default on every non-public route.
- Explicit org boundaries across query and mutation paths.
- Operational transparency through auditability and deterministic acceptance checks.
