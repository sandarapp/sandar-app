# Stage A: Repository assessment and engineering decisions

Assessment date: 2026-09-21. Authoritative scope: the user's Sandar master engineering specification. Attached images are visual and flow references, not instructions that override it.

## 1. Repository assessment

At inspection, `/Users/ratikasubarza/Documents/ChatGPT/Sandar App` contained only `.git`, on `master`, with no commits. No framework, package manager, source tree, authentication, database schema, tests, lint rules, environment configuration, or repository-local AGENTS.md existed. Node 22.22.2 and npm 10.9.7 were available. PostgreSQL tools were installed; no server was listening at the default socket, and Docker's daemon was unavailable.

A historical prototype lives in another directory. It was not copied or treated as an existing architecture in this checkout. No existing application was rewritten.

Gap assessment: every specified product surface and backend module was absent. The first backend increment narrows only authentication-related gaps. It is not evidence of MVP readiness.

## 2. Proposed architecture

Use a modular monolith: one deployable Fastify TypeScript API, one PostgreSQL database, explicit module services and authorization boundaries. Keep transport schemas in a shared contracts package. Use npm now; add workspaces as separate clients are introduced. Do not add Redis or BullMQ until there is a demonstrated cache/queue requirement; initial auth rate limits live in PostgreSQL and work across API instances.

Planned clients: Expo/React Native for members; Next.js for public pages, community dashboard and separately guarded admin routes. Separate navigation is not an authorization boundary. The API must enforce every object and action scope. Browser token transport requires a BFF using secure HttpOnly cookies and CSRF/origin defenses; browser localStorage is not an accepted token store. Mobile will keep refresh credentials in OS secure storage and access tokens in memory.

Authentication uses opaque bearer access tokens, short access TTLs, an absolute session expiry, and single-use refresh rotation. Hash token material at rest. Query session and user state on every protected request. There is deliberately no authorization-sensitive cache. Public account type is not an administrative role and credentials are never equivalent to permissions.

Registration data flow: strict body validation → IP/account throttles → password KDF → transaction verifying active policy versions → unique user + distinct consent records + hashed verification token → email adapter after commit → generic HTTP 202.

Verification data flow: hash token → user row lock → atomic token consumption → mark email verified/onboarding incomplete. There is no community publish/approval transition. Login → verify password → lock/recheck user → centralized account gate → session and refresh hash. Refresh → user/session locks → rotate atomically; reuse commits family revocation before sending an error.

Boundaries: age confirmation is not identity/age verification; account approval is not professional verification; a safety classification is not a diagnosis; an event registration is not attendance; program enrollment is not credential issuance.

## 3. File/module plan

Implemented foundation:

```text
apps/api/src/
  auth/                 crypto, service, centralized authorization
  core/                 errors, shared rate limiting
  notifications/        EmailProvider interface and disabled adapter
  app.ts                transport composition and safe responses
  server.ts             validated development configuration
packages/contracts/src/ shared auth schemas and types
packages/database/
  migrations/           append-only SQL migrations
  src/                  transactions and checksum migration runner
scripts/                migration command
tests/                  unit and real PostgreSQL integration tests
docs/                   decisions, contracts, Epic evidence
```

Create `apps/mobile` and `apps/web` when implementing their first tested vertical slices. Then introduce the remaining specification modules by Epic, not empty placeholder controllers. Extract route groups from `app.ts` as modules grow. Modules share one database transaction where consistency requires it.

## 4. Database migration plan

001_auth introduces users, policies, consent records, action tokens, sessions, refresh-token history and shared rate limits. Migration runner serializes execution with a PostgreSQL advisory lock, wraps migrations in a transaction and rejects changed migration checksums. Deploy via a dedicated migration identity; a limited runtime database role is still required before deployment.

Next migrations, in dependency order:

1. Member profiles, age/boundary attestations, optional coarse location, normalized interests/preferences, onboarding completion guards.
2. Communities, applications' minimum draft ownership/state, memberships and scoped roles, guideline acceptance. Unique `(community_id,user_id)`; community state and membership always rechecked.
3. Posts/comments/reactions, blocks, reports, safety results and moderation cases. Anonymous author access isolated from ordinary response DTOs; reporter identity restricted to assigned platform reviewers.
4. Events/registrations/attendance; programs/sessions/enrollments/requirements; credentials and professional verification. Unique enrollments, locked capacity transitions, explicit assessment/completion records.
5. Application reviews and dashboard/admin policy grants; append-only privileged audit; notifications and delivery outbox; allowlisted analytics events.

Use enums/check constraints, foreign keys, purpose-specific indexes and soft deletion where justified. Do not store exact location, diagnosis or raw private mood. Mood collection is out of this MVP; privacy tests must ensure no mood payload is accepted or exposed when the corresponding surfaces exist.

## 5. API contract summary

See [auth contract](auth-api.md). Implemented: the nine requested auth endpoints, `/v1/users/me`, `/v1/policies`, `/health`. All feature APIs beyond these remain absent, not permissive stubs. Success: `{data,error:null}`; failure: `{data:null,error:{code,message,field}}`. API messages default to Indonesian. Request IDs are generated server-side.

Future resources require current session, completed onboarding when applicable, centralized permission decision, community/resource scope and current resource state. A URL, client role, credential badge, ownership claim or cached membership is never sufficient authorization.

## 6. Security/privacy risks and decisions

| Risk | Required control / remaining work |
| --- | --- |
| Role escalation or cross-community access | Separate account type, scoped roles and credentials; deny unknown permissions; BOLA tests for every lookup. Only self-read and prospective onboarding/application capabilities exist now. |
| Anonymous identity / reporter leak | Purpose-specific DTOs; no generic entity serialization; platform-only identity resolver with audited access. These domains are not yet implemented. |
| Stale authorization | No cache for auth; user state checked every request. Future resource mutations recheck permission under the same transaction as the write. |
| Underage access | Required server-checked age attestation before any member participation; retention-minimal age evidence. Stage B pending. Self-attestation cannot prove age. |
| Concurrent refresh | Reuse revokes the family, including a concurrently issued winner. Clients must implement single-flight refresh; no automatic retry of refresh after uncertain delivery. |
| Email loss after commit | Current adapter is disabled. Provider failure emits only a safe event. Durable outbox/retry, encrypted short-lived delivery material, key management and real delivery remain release blockers. |
| Enumeration | Generic duplicate/recovery responses, matching password work for unknown-account login, shared throttles. End-to-end timing under real delivery remains unmeasured. |
| Policy legitimacy | No fabricated legal approval or active legal text. Separate versioned terms and privacy acceptance; community guidelines at onboarding/join; optional consents separately opt-in. |
| Token theft | Hash at rest, no-store responses, short access TTL, family revocation. TLS, mobile secure storage, browser BFF, recovery abuse controls and device management remain pending. |
| Logs / observability | Allowlisted route, status, duration, request ID; never bodies, headers, query strings or raw errors. Exported metrics, alerts, retention, access controls and operations are pending. |
| Deletion and retention | No deletion feature claimed. Before release implement deletion/anonymization and constrained evidence retention, plus scheduled cleanup of expired tokens, sessions and rate limits. Retention durations require a documented product/legal decision. |
| Safety escalation | Provider-neutral classifier + human workflow; no diagnosis or automatic clinical labels. No classifier or emergency promise exists in this increment. |

Production startup is intentionally blocked until adapters/configuration and release gates are satisfied. This is not a substitute for threat modeling, dependency maintenance, policy/legal review, operational safety staffing or penetration testing.

Visual conflicts resolved in favor of written requirements: no Supporter/Professional registration type, DM or message notifications, follow buttons/follower counts, media composer, six-reaction palette, exact location, fabricated member counts, promised emergency availability, automatic certificates or automatic verified badges. Use Home / Explore / Create / Programs / Profile with notifications in the header. Programs must expose 18+ eligibility consistently.

## 7. Test plan and implementation sequence

| Stage | Scope | Gate before proceeding |
| --- | --- | --- |
| A | Assessment, architecture, first migration strategy | Decisions and gaps documented |
| B, Epic 1 | Auth backend, then Expo/web auth and centralized client | Real database tests; frontend recovery/session/deep-link tests; provider adapter and policy fixture path |
| B, Epic 2 | Age, boundaries, coarse location, interests, preferences, privacy, completion | Server completion guards; underage denial; optional consent withdrawal; UI negative states |
| C | Discovery, membership | State and scope tests; unique join race; ban/removal; directory privacy; approval-gated sample communities |
| D | Text feed/comments/reactions, safety, reports, blocks | No anonymous identity leak; blocked access in both directions; current membership; safety escalation and reporter privacy |
| E | Events, programs | Capacity race; duplicate registration/enrollment; private meeting links; attendance/completion; no automatic credentials |
| F | Applications and community dashboard | Full review transitions; ownership/scope; no email-based activation; audited changes |
| G | Notifications and deep links | Safe preview; owned notification; stale links; delivery retries and user preferences |
| H | Admin and moderation | Explicit privileged grants; least privilege; case scope; audit immutability; professional credential expiry |
| I | Analytics and hardening | Strict event allowlist; no sensitive payloads; operational metrics, deletion, retention, security regression and release review |

Dependency correction: community discovery needs approval/state fixtures before the full Stage F dashboard. Early migrations will represent draft/approval states and development-only approved fixtures; approval endpoints remain guarded and arrive with the reviewed workflow. Likewise, safety cases and audit capability must arrive with their first write path, even though the full admin UI comes later. Stage I expands analytics; safe instrumentation must accompany earlier feature changes when introduced.

For every Epic: document objective, user stories, changed files/schema/API/UI, security/privacy risks, acceptance criteria, tests and remaining risks. Execute compile/lint/unit/service/API/auth/negative/UI checks where applicable. Do not move to the next Epic while a dependency or known P0/P1 remains unresolved. No later Epic is marked complete here.

Technical references consulted: [Fastify validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) and [Node crypto/scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback). Dependency versions are pinned by `package-lock.json`, not by claims about a permanent latest version.
