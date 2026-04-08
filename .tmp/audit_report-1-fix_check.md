Issue Recheck (Static-Only)

Scope: re-verified only the 3 previously reported issues via code + test inspection, without running app/tests.

1) Cross-tenant metadata exposure in portfolio tags
- Status: Fixed
- Conclusion: Pass (static)
- Evidence:
  - Tags endpoint now passes caller scope into repository query: `apps/api/src/api/routes/portfolio.ts:299`
  - Merchant filter and org-scope filter are enforced in tag query: `apps/api/src/infrastructure/persistence/portfolio-repository.ts:173`
  - Query now joins `portfolio_items` and applies `deletedAt` + scope predicates before returning distinct tags: `apps/api/src/infrastructure/persistence/portfolio-repository.ts:175`
- Notes: This directly addresses prior global tag enumeration risk.

2) Frontend event management controls exposed to Operations while backend denies
- Status: Fixed
- Conclusion: Pass (static)
- Evidence:
  - UI management gate now only allows merchant/admin: `apps/web/src/app/features/events/events.component.ts:160`
  - Create/Edit/Status controls are guarded by `canManage()` in template: `apps/web/src/app/features/events/events.component.ts:17`, `apps/web/src/app/features/events/events.component.ts:74`
  - Backend permission model still excludes operations from event create/update, so UI is now aligned: `apps/api/src/core/domain/permissions-manifest.ts:83`, `apps/api/src/api/routes/events.ts:18`

3) Missing integration coverage for portfolio-tag tenant isolation
- Status: Fixed
- Conclusion: Pass (static)
- Evidence:
  - New integration scenarios explicitly validate cross-tenant tag isolation:
    - merchant A cannot see merchant B tags: `apps/api/test/integration/security.test.ts:383`
    - merchant B cannot see merchant A tags: `apps/api/test/integration/security.test.ts:394`
    - ops in org A cannot see org B tags: `apps/api/test/integration/security.test.ts:405`
    - search endpoint respects tenant scope: `apps/api/test/integration/security.test.ts:416`
- Notes: Coverage now directly targets the previously missing high-risk path.

Overall recheck result
- 3/3 issues appear addressed by static evidence.
- Manual verification still recommended for runtime confidence (execute integration tests), but no remaining static evidence of the prior defects.
