# F03 verification — 2026-10-03

Scope: Member Onboarding only. F04/F05 feature behavior was not tested. Member Home was entered solely to verify the authoritative destination.

## Working tree and changes

Existing source was preserved; no partial test writes were present. Earlier missing model/screen tests were completed. The continuation reproduced and fixed the city-query restriction, test-helper generic typing, initial Welcome analytics omission, committed-completion retry, saved language restoration, and finally locale-policy ordering before resume selection.

The latest continuation changed only `apps/mobile/src/MemberOnboarding.tsx`, `tests/onboarding-screen.test.jsx`, and this evidence directory. The final locale fix fetches the saved-language policy before choosing the resume step. It does not change authentication or the destination resolver.

## Automated evidence

- Mobile typecheck: PASS after final source change.
- API typecheck: PASS after final source change.
- API/domain/model/resolver: 68/68 PASS achieved before the final mobile-only locale fix; not unnecessarily rerun afterward.
- Mobile screen tests: 23/23 PASS after final changes.
- Focused saved-locale resume test: failed before the fix, passed after.
- Completion committed / refresh offline / retry: PASS in screen tests. The simulated fault is automated, not an Android network-fault claim.
- Locale fixture now distinguishes English-only consent (requires acknowledgement) from current Indonesian consent (resumes Review).
- `git diff --check`: PASS.

## Android evidence

Reused the existing disposable incomplete Member. No account reset was required.

PASS: Welcome; under-18 block; separate explanation; boundaries gate; permission denied; granted permission with bounded geocoding fallback; manual location; Skip; saved city on Back; interest multi-select/exclusivity; Read Quietly and multiple participation choices; Hybrid; privacy validation/toggles; Review; editing Support Interests and Participation; completion; authoritative Home routing.

PASS: incomplete force-stop resumes Format; saved Indonesian and edited selections survive cold start and resume Review; completed cold start goes to Member Home without F03.

Expo Go required a second project open intent after force-stop. No matching fatal Android exception was found in the inspected recent log. This is Expo Go verification, not a standalone release-build test.

Device-geocoding success: NOT VERIFIED ON CURRENT EMULATOR. Permission succeeded; lookup timed out; manual/Skip remained usable. Successful coarse geocoding is covered by automated tests only.

## Database and runtime evidence

Read-only queries after completion confirmed:

- age confirmation present;
- boundaries version `dev-epic1-v1`, locale `id-ID`;
- final location `SKIPPED`, country/city NULL;
- needs `LONELINESS`, `BURNOUT`;
- participation `READ_QUIETLY`, `ATTEND_EVENTS`, `JOIN_PROGRAMS`;
- UI Hybrid stored as legacy `MIXED`;
- language `id-ID`, profile `MEMBERS`, directory `DISPLAY_NAME`, anonymous posting enabled;
- completion timestamp present and user status `ACTIVE`;
- no latitude/longitude/GPS/coordinate columns in ordinary member_profiles;
- completion analytics count rose from 0 to 1 in this controlled local run, remaining 1 after re-entry. Analytics deliberately has no user identifier; this is a measured delta, not a user-ID join.

Completion returned HTTP 200. Logs afterward contain fresh `/v1/users/me` HTTP 200 responses, zero onboarding PATCH requests, and zero 409/500 responses. Completed-account re-entry did not try to edit the completed profile.

Migration 008 was applied using the existing migration runner. Destructive transaction/rollback tests used only `sandar_onboarding_test`.

## Visual assessment

Compared with the supplied canonical M1/F03 sequence (no Experience Level or Community Suggestions steps). Warm ivory/terracotta, serif/sans hierarchy, selected states and progress are present. Full visual parity is NOT claimed.

- P1: no task-blocking visual defect observed.
- P2: Review uses large full-width Edit buttons and requires substantially more scrolling than the compact reference; some Indonesian explanatory paragraphs remain English; completion screenshot contains a blank illustration area despite the source asset being present (image-load timing versus render defect not isolated).
- P3: stock blue Android switches differ from the warm reference; short steps have excess lower whitespace; decorative step motifs and compact Back treatment differ from the board.

Reduced-motion press behavior passed automated testing; no new Android OS reduced-motion toggle test was performed in this final continuation.

Functional F03 verification PASS. Visual parity remains partial. Production readiness is not asserted: directory coverage is intentionally limited, development policy fixtures are not final legal content, full Indonesian copy and completion-art rendering still need follow-up. No F04/F05 feature verification was started.
