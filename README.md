# Sandar

Indonesian-first, adult-only community and peer-support platform. **Development prototype, not a production service.** No clinical diagnosis, treatment, emergency response, real users, traction, partners, or production integrations are claimed.

This checkout was an empty Git repository. The first increment implements the **authentication backend**, not the complete MVP. Expo, Next.js, onboarding and every later Epic are still pending. See [architecture and sequence](docs/architecture.md), [API contract](docs/auth-api.md), and [Epic 1 evidence and remaining work](docs/epic-01-authentication.md).

## Run locally

Requires Node 22.22+ and PostgreSQL. This repository uses npm and a committed lockfile.

```sh
npm ci
cp .env.example .env
```

Create `sandar` and the separate disposable `sandar_test` databases using your local PostgreSQL administrator. Set `DATABASE_URL` and `TEST_DATABASE_URL` in `.env`. No database credentials are supplied or committed. Then:

```sh
npm run db:migrate
npm run dev
```

The API binds to `127.0.0.1:3001`. `GET /health` checks database connectivity. `GET /v1/policies` lists active policies; no real policies are seeded. Registration correctly refuses consent versions that have not been configured.

**Email is disabled.** There is no inbox, token-retrieval endpoint, token logging, or real delivery. Automated tests inject an in-memory email provider to exercise the full authentication flow. Interactive end-to-end signup needs the next increment's development inbox adapter and reviewed development policy fixtures. Production mode intentionally fails configuration validation.

## Verify

Export `TEST_DATABASE_URL` for a local disposable database whose name ends in `_test`, then:

```sh
npm run check
```

This runs strict type checking, ESLint, Vitest unit/API/service/authorization tests against real PostgreSQL, and the TypeScript build. Missing database configuration fails the suite instead of silently skipping security tests. Integration tests **truncate their configured test database tables**; never point them at a shared database. Environment variables in `.env` are consumed by `dev` and `db:migrate`; export the test URL explicitly for `check`.

## Scope and exclusions

- Auth: registration by account type; policy-version acceptance; verification/resend; login/logout; rotating refresh; forgot/reset password; self profile; current account-state enforcement.
- Persistence: versioned SQL migrations, foreign keys, uniqueness, transactional token consumption, shared database rate limits.
- Protection: parameterized SQL, scrypt passwords, hashed random tokens, explicit response DTOs, strict request schemas, no-store responses, generated request IDs, allowlisted logging.
- No community activation from email verification. No client-supplied roles. No admin routes exist yet.
- No DM, following, friends, image/video posts, AI therapist/diagnosis, live location, payments or fundraising.

No production approval is implied by passing the current tests. Legal policy review, operational safety, delivery reliability, frontend security, deletion, audit, and the remaining product flows are release dependencies.
