# F04 canonical regression verification — 2026-10-03

Application code was not changed. Existing F03 visual debt was not reopened. F05 was used only as entry navigation; no F05 refinement or F06 work occurred.

## Classification

| Area | Result |
|---|---|
| Official list/source, identity, profile, guidelines | MATCH |
| Completed Member access; verification/onboarding/role gates | MATCH |
| Join, acknowledgement, duplicate/concurrent join | MATCH |
| Space-scoped feed, text-only named/anonymous posts | MATCH |
| Anonymous response protection, duplicate posts | MATCH |
| Comments, reports, two-way blocking including anonymous content | MATCH |
| Restricted/banned access, session rejection, write authority | MATCH |
| Reaction add/idempotency/concurrency | MATCH |
| Reaction remove/toggle | MISSING FROM EXISTING IMPLEMENTATION |
| Regression introduced by F01/F02/F03 | None reproduced |

The UI always POSTs the selected reaction, including when already selected. Server exposes only reaction addition; no removal handler exists. On Android a second tap on Support leaves it selected. A DELETE probe without an empty JSON content-type returns NOT_FOUND. The initial probe carrying an empty JSON content-type returned 400 before route handling; that result alone was not used to infer the missing route. No removal feature was added because this task permits only fixes for proven regressions.

## Automated checks

- `npm run typecheck:mobile`: PASS.
- `npm run typecheck:api`: PASS, including after test additions.
- Existing Spaces/client/resolver baseline: 58/58 PASS.
- Expanded existing targeted suites: **69/69 PASS** (Spaces API 37, client 7, destination resolver 25).
- Database: isolated `sandar_spaces_test`; normal development DB was never used for destructive tests.
- `git diff --check`: PASS.

New coverage: unverified ACTIVE account denial; direct-route F03 bypass denial; preferences cannot auto-join/grant posting; maximum text/empty and invalid comments; banned/restricted checks on reactions/comments/report/block; session expiry during join/writes; concurrent reaction additions; anonymous parent identity protection; inaccessible moderation routes; explicit client retry following simulated network outage.

69 passing tests do not establish reaction removal: that missing acceptance criterion remains blocked. No full repository, web, iOS or F03 suite was run. Existing pagination is capped at 50 posts/100 comments without a paging API; no paging feature was invented. Inactive/closed statuses are not part of the existing ACTIVE/RESTRICTED model.

## Android checks

Reused the completed disposable F03 Member and an existing second-member anonymous post fixture.

PASS: Home → Official Space profile; correct Official Sandar Space badge; guidelines; disabled Join before acknowledgement; first join; populated feed; named text post; anonymous text post displayed as Anonymous Member; reaction addition; supportive comment; report acknowledgement; block confirmation; blocked anonymous content hidden; force-stop/relaunch and persisted joined feed; server-rejected session hides content and shows expiry state; authoritative Sign In recovery returns to joined feed.

FAIL / missing: selected reaction cannot be removed by tapping again.

Session rejection was induced through the existing development password-reset flow for this disposable account, not direct SQL session edits. The account password was changed to a generated development value held only in the test process. The Android session is reauthenticated; later login can use another development reset if needed. No credentials/tokens were included in evidence files. Timed session expiry was separately covered in isolated API tests. The UI passes from the F04 expiry screen through the existing foundation expiry screen before Sign In.

Restricted/banned behavior and outage retry were tested automatically in this pass; prior Android restricted-space/outage results were not presented as newly rerun manual checks. Empty feed is covered in the existing API suite; this reused development Space was populated.

## Read-only database/API verification

- Work Stress & Burnout: OFFICIAL_SANDAR, ACTIVE permissions; UI-created JOINED membership and dev-spaces-v1 acknowledgement persisted.
- Exactly two new harmless QA posts: PROFILE and ANONYMOUS, both VISIBLE and linked to the Official Space and author server-side.
- Anonymous QA post has one SUPPORT reaction, one comment and one report; report creates a safety-review case through the existing API transaction.
- One UI-created block persisted for this Member.
- Normal Member API returns Anonymous Member without author ID fields and excludes the blocked second-member anonymous fixture.
- Existing F03 preferences neither auto-joined the tested Space nor granted posting before join; backend checks actual completed profile, account state, membership and Space permissions.

## Visual QA

Compared current Android profile/composer/feed evidence with the approved Official Spaces board dated September 27, 03:14:31 PM. No redesign was performed.

- P1: no task-blocking visual defect observed.
- P2: tall profile/hero and feed headers; tall cards and full-width controls; composer vertical pressure; reused editorial imagery; no clear active local-tab underline.
- P3: pill-heavy controls and typography/spacing finishes differ from the reference.

## Files changed in this task

- tests/spaces.integration.test.ts — added targeted cases to existing suite.
- tests/spaces-client.test.ts — added explicit outage/retry case.
- docs/qa/f04-regression/ — report and Android screenshots.

No application, schema, auth, routing, F03, or F05 source changes.

F04 FUNCTIONAL STATUS: BLOCKED for canonical sign-off because reaction removal/toggle is missing. Tested existing functionality otherwise passes. Production safety-adapter/moderation readiness remains an existing deployment prerequisite, not a newly introduced regression.
