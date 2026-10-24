# F04 reaction removal sign-off — 2026-10-04

No implementation changes in this final continuation. Existing working tree preserved; reaction source/test files inspected for complete writes and git diff --check passed.

## Contract and implementation files

- POST /v1/space-posts/:id/reactions with {type}: idempotent insertion.
- DELETE /v1/space-posts/:id/reactions/:type: idempotent physical deletion scoped to authenticated member, post and type. Already absent returns the authoritative deselected projection.
- Existing primary key is (post_id,user_id,type); distinct types can coexist. Wire values SUPPORT, RELATE, ENCOURAGEMENT. No migration.
- Existing membership, account, onboarding, Space, visible-post and two-way block checks are reused. Anonymous projections contain no author identifier.
- apps/api/src/spaces/routes.ts
- apps/mobile/src/spaces/SpacesApp.tsx
- packages/auth-client/src/client.ts
- tests/spaces.integration.test.ts
- tests/spaces-reaction-screen.test.jsx
- vitest.spaces.config.ts

## Recovered completed command results (previous turn, not rerun)

- Focused API: 16 passed, 37 intentionally filtered out.
- Rendered mobile reaction controls: 3 passed.
- npm run typecheck:mobile: PASS.
- npm run typecheck:api: PASS.
- TEST_DATABASE_URL=postgresql://localhost/sandar_spaces_test npx vitest run tests/spaces.integration.test.ts tests/spaces-client.test.ts tests/destination.test.ts: 85/85 passed (53 API, 7 client, 25 resolver).
- Coverage includes ownership, missing/banned/restricted membership, inactive Space, account/session/onboarding gates, invalid types/posts, duplicate add/remove, anonymous projection and both block directions. UI tests cover server-confirmed state, duplicate-tap prevention and failed add/remove recovery.

## Android and read-only DB evidence (this continuation)

Emulator-5554, existing completed disposable F03 Reviewer, Work Stress & Burnout, existing anonymous QA post dated October 3. Metro was stopped; restarted through npm run dev:mobile -- --port 8081 and restored ADB reverse. The app was signed out, so the same disposable account was reauthenticated using the existing development reset-email flow. Passwords/tokens were not saved in evidence or printed. No reaction rows were modified through SQL.

| Step | UI selected | Exact member/post/SUPPORT rows |
|---|---|---|
| Initial state | true | 1 |
| Remove | false | 0 |
| Add | true | 1 |
| Remove again | false | 0 |
| Re-add | true | 1 |
| Force-stop/reopen, navigate to same post | true | 1 |

RELATE quick cycle: false/0 → true/1 → false/0. After cold start, RELATE remained unselected. Screenshots capture removed, re-added and restored states.

Final read-only DB query: support_rows=1, duplicate_tuples=0, orphan_rows=0. Tuple queries joined the exact member email, existing post, and Work Stress & Burnout Space to confirm relationships.

No new reaction defect or remaining canonical F04 blocker. Frozen visual debt unchanged. No F05 implementation.

F04 FUNCTIONAL STATUS: PASS
