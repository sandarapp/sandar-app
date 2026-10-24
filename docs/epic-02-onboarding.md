# Mobile onboarding — Android verification, 25 September 2026

## Objective and scope
Verified members can save adult confirmation, community boundaries, an optional city, optional non-clinical support preferences, and privacy settings, then reach a simple Member Home. No discovery, feed, web, CMS, or iOS work is included.

## Architecture and contract
The existing Fastify modular monolith and native session client are retained. Native `memberRequest` obtains/revalidates a session; every onboarding route authenticates and authorizes the member on the server. Mutations lock the user row inside a transaction. Client role state is not an authorization boundary.

| UI | Endpoint | Validation | Persistence |
|---|---|---|---|
| Initial/foreground state | GET /v1/users/me/onboarding | Valid member session | Explicit profile projection |
| Adult confirmation | PATCH /v1/users/me/onboarding/age | confirmed=true | age_confirmed_at; no birth date |
| Boundaries | PATCH /v1/users/me/onboarding/boundaries | accepted=true, current version and locale | boundaries_version/locale; versioned consent_records |
| City/country or skip | PATCH /v1/users/me/location | Manual/device require city and two-letter country; skip requires null values | city, country, location_source, location_permission |
| Interests/participation/format | PATCH /v1/users/me/preferences | Allowlisted unique arrays, empty allowed; format enum | needs, goals, community_type, preferences_saved_at |
| Privacy | PATCH /v1/users/me/privacy | Nonempty display name, supported language, visibility enums | display_name, language, profile_visibility, directory_visibility, allow_anonymous_posting, privacy_saved_at |
| Review/finish | POST /v1/users/me/onboarding/complete | All required decisions and active consent | onboarding_completed_at; users.status=ACTIVE atomically |

All responses use the existing data/error envelope. Fields live in member_profiles (user foreign key), with users, policies, and consent_records reused. Migrations 003 and 004 add the profile and locale support. Development policy fixtures exist in English and Indonesian. Onboarding defaults to English; acceptance uses the returned policy locale, not a hardcoded Indonesian locale. Historical Indonesian profiles/consents are preserved. The existing authentication UI is outside this onboarding copy change.

Six existing screens group age, boundaries, location, support/participation/format, privacy, and review. Saved steps reload from the API. Back preserves in-memory drafts; Continue persists each step. Unsaved edits are not promised to survive process termination. Completion renders MemberHome; it does not fabricate community recommendations.

## Runtime evidence
A separate development-only member was used because the original test member had already completed onboarding. That original profile was preserved.

| Check | Result | Evidence |
|---|---|---|
| Location denied | PASS | Android Don't allow -> explicit denied fallback |
| Manual city/country | PASS | Makassar/ID saved as MANUAL with DENIED permission |
| Skip location | PASS | SKIPPED; city and country cleared to null |
| Support interests | PASS | CONNECTION and BE_HEARD saved |
| Participation | PASS | LISTEN and LEARN saved |
| Community format | PASS | ONLINE selected and saved |
| Privacy | PASS | Sunny Explorer, MEMBERS, directory HIDDEN, anonymous true |
| Back/saved choices | PASS | Hardware Back restored city/country; screen Back restored switches, format, display name and privacy |
| Required validation | PASS | Age/boundary buttons disabled until acknowledged; missing city and display name disable Continue |
| Completion | PASS | Member Home rendered |
| Database persistence | PASS | SQL matched every selected preference; language and boundary locale en |
| ACTIVE status | PASS | SQL confirmed atomic completed profile and ACTIVE user |
| Force-stop/reopen | PASS with Expo harness caveat | Force-stopped Expo Go; reopened experience and restored Member Home |
| No repeated onboarding | PASS | No login or onboarding steps after reopening experience |

Expo Go's first cold launch intent reached LauncherActivity and returned to Android Home. A second intent foregrounded ExperienceActivity and restored the saved state. This is not evidence of standalone APK launch behavior. No ReactNativeJS warning/error or AndroidRuntime error appeared in the bounded logcat check. Automatic city lookup previously timed out with a working manual fallback; successful geocoding is not claimed.

## Targeted tests
- `npm run typecheck:mobile`: PASS.
- `TEST_DATABASE_URL=postgresql://localhost:5432/sandar_onboarding_test npx vitest run tests/onboarding.unit.test.ts tests/onboarding.integration.test.ts`: PASS, 26 tests / 2 files.
- Tests use an explicitly guarded, isolated database, never the development member database for truncation.
- Coverage includes invalid/missing input, session/account authorization, extra user-id/coordinate rejection, optional preferences, locale/version mismatch, withdrawn consent, idempotent completion, and database persistence.
- No web, iOS, browser E2E, or full repository suite executed.

## Security/privacy and remaining limits
No diagnosis, precise coordinates, or birth date is persisted. The device may use coordinates transiently for reverse geocoding; only the city/country is sent to Sandar. Privacy starts hidden. Support preferences are optional. Session and account status are checked on each server call. Clinical services and emergency care remain outside product scope.

Policy fixtures are development content, not production legal approval. Language selection UI, post-onboarding preference editing, real-device/standalone APK verification, and successful geocoding are not part of this verification. No remaining blocker was observed for the requested onboarding flow in Expo Go.

## Files in the onboarding change
- apps/api/src/app.ts — mount onboarding routes.
- apps/api/src/onboarding/routes.ts — authenticated persistence and completion.
- apps/mobile/App.tsx — member routing and lifecycle integration.
- apps/mobile/src/MemberOnboarding.tsx — native steps, location fallback, English copy and styling.
- apps/mobile/src/MemberHome.tsx — completed member destination.
- apps/mobile/package.json and package-lock.json — SDK-compatible expo-location only.
- packages/auth-client/src/client.ts — authenticated member requests and locale header.
- packages/contracts/src/onboarding.ts — schemas, response type, supported/default locale.
- packages/database/migrations/003_member_onboarding.sql and 004_onboarding_locale.sql.
- scripts/seed-auth.ts — development policy fixtures for supported locales.
- tests/onboarding.unit.test.ts and tests/onboarding.integration.test.ts.
- docs/epic-02-onboarding.md, design-qa.md and docs/qa/onboarding/*.png — verification evidence.

Pre-existing Metro, auth-link/test and web worktree changes were preserved. They are not attributed to this onboarding change.
