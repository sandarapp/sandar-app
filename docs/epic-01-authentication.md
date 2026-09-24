# Epic 1 — Authentication

Status: **backend increment implemented; full Epic acceptance still pending frontend and email integration.** Later Epics are not started.

## Objective

Establish a testable authentication boundary using persistent, transaction-safe server-side sessions, without giving client-supplied account types or roles authority.

## User stories

- A member or community representative can request an account with separate versioned policy acceptance.
- An account holder can verify email, sign in, renew a session, sign out, and recover a forgotten password.
- An expired or reused token fails safely; recovery supports a fresh link.
- A suspended/deactivated/deleted account loses authenticated access immediately.
- A community account can verify email without becoming approved or discoverable.

These stories currently have API/test support; no interactive member UI or real email delivery is claimed.

## Files changed

- Root package manifests/lockfile, TypeScript build configuration, ESLint, Vitest, `.env.example`, `.gitignore`, README.
- `apps/api/src/auth/{crypto,authorization,service}.ts`: hashing, centralized capabilities, state checks, transactional auth lifecycle.
- `apps/api/src/core/{errors,rate-limit}.ts`: safe errors and shared atomic throttling.
- `apps/api/src/notifications/email.ts`: email interface and disabled development adapter.
- `apps/api/src/{app,server}.ts`: routes, validation, safe logs/headers, development configuration.
- `packages/contracts/src/auth.ts`: reusable strict contracts and entity types.
- `packages/database/migrations/001_auth.sql` and `packages/database/src/{database,migrate}.ts`: schema and transactional migration runner.
- `scripts/migrate.ts`; `tests/auth.unit.test.ts`; `tests/auth.integration.test.ts`; engineering docs.

## Database changes

Users, policies, consent records, single-use action tokens, sessions, refresh-token history and rate limits. Unique normalized email, foreign keys, constrained state/type values, expiring hashed tokens and indexes. No community or privileged grants table is introduced ahead of its required authorization workflow.

## API changes

All nine specified auth routes plus self-read, policy discovery and database health. See [exact contract](auth-api.md). No unauthorized fallbacks, fake admin endpoints or placeholder success responses for later modules.

## Frontend changes

None yet. Expo/Next.js auth screens, shared API client, OS secure storage, browser BFF, deep-link recovery, offline/timeout/error UI and unsaved-form navigation are pending. Images guide appearance; excluded mechanics in the images will not be implemented.

## Security risks

Production startup is blocked. No audited deployment, TLS termination, production secret management, least-privilege database user, production email provider, durable mail queue or frontend token transport exists. Rate limiting is foundational; distributed abuse and resource exhaustion still need capacity review. Refresh replay protection deliberately requires client single-flight coordination.

## Privacy risks

No bodies, passwords, tokens, addresses, raw provider errors or request URLs are logged by request logging. Email remains personal data in the database. No GPS, diagnosis, mood, profile or professional documents are collected. Deletion and retention are not implemented; legal policies are not fabricated. Token and rate-limit cleanup jobs must precede production.

## Acceptance criteria

- [x] Strict registration/auth validation and explicit account types.
- [x] Separate versioned terms/privacy consent persisted transactionally.
- [x] No activation of community through email verification.
- [x] Password hashing and non-plaintext token persistence.
- [x] Single-use, expiring verification/reset tokens.
- [x] Rotating refresh with committed family revocation on replay.
- [x] Immediate account-state enforcement and all-session revocation on password reset.
- [x] Generic duplicate/recovery responses, request IDs, no-store headers and shared throttling.
- [ ] Interactive Expo and web authentication with all required states.
- [ ] Development inbox and policy fixture path; production adapter/outbox before release.
- [ ] Secure client session persistence, deep-link return navigation and UI tests.
- [ ] Complete operational/privacy release gates and no known P0/P1 after full-system testing.

## Tests added

Verification: **40 tests passed**, strict TypeScript, lint and build passed. See [validation record and environment limitations](validation.md).

Unit tests: salted password hashing/checking, token format, strict schema/consent validation, central permission/account-state rules and safe serialization. A captured-log regression also confirms secrets and internal error text are absent on success, invalid query input and database failure.

API/real PostgreSQL tests: schema migration repeatability, registration/consent persistence, normalized duplicate requests, registration and verification concurrency, invalid policy versions, role/status injection, unverified login, community nonactivation, stale/expired verification recovery, generic recovery, unauthenticated access, self-only reads, refresh rotation/replay/concurrency/expiry, account state changed mid-session, logout/idempotency/cross-user isolation, password reset purpose/expiry/replay and session revocation, database throttles, forwarded-header bypass, malformed/oversized input, safe errors and email-provider failure recovery. Service behavior is also exercised directly for the failure adapter.

No claims are made for community BOLA, anonymous posts, mood/location privacy, banned membership, report ownership, blocked-user bypass, events, programs, moderation or UI tests: their modules do not exist yet. Future tests must establish these invariants, not merely assert missing routes.

## Remaining risks and next increment

Complete Epic 1's secure client and development email/policy path before proceeding to Epic 2. Add member age/boundary/privacy onboarding only after auth UI and client security gates pass. Keep real email and production startup disabled until reviewed integrations and operations exist. This increment is not an MVP release or a completed full-stack authentication feature.
