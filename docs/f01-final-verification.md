# F01 final verification — 27 September 2026

Scope: remaining verification only. No application source or design changes in this continuation. Previously completed feature implementation and unrelated auth/onboarding flows were not repeated.

## Runtime results

- **Restricted space: PASS.** Temporarily set the development Work Stress & Burnout fixture to RESTRICTED, refreshed Android via Home → profile, and asserted the restricted message. The Open/Join action was absent and Explore other spaces was available. Restored the original ACTIVE state in a finally block. Evidence: `qa/spaces/restricted-final.png`.
- **Session expiry: PASS.** Revoked only the disposable `onboarding-runtime-1790310208@example.invalid` member's active sessions, then navigated to Discover. The app hid protected content and displayed Your session has expired with Sign in again. That action reached the existing login screen. Evidence: `qa/spaces/session-expired-final.png`.
- Reauthenticated the same development fixture to capture current screens and left the app on Member Home. No new posts/comments were submitted in this continuation.
- Bounded final ReactNativeJS/AndroidRuntime error log check returned no error lines. This is not a whole-session log audit.

## Final targeted checks

| Command | Result |
|---|---|
| npm run typecheck:mobile | PASS |
| npm run typecheck:api | PASS |
| TEST_DATABASE_URL=postgresql://localhost:5432/sandar_spaces_test npx vitest run tests/spaces.integration.test.ts tests/spaces-client.test.ts | PASS — 33 tests, 2 files |

The dedicated test database was used. No web, iOS, browser E2E or full repository suite was run.

## Visual comparison

Source: `/Users/ratikasubarza/Downloads/ChatGPT Image Sep 27, 2026, 03_14_31 PM.png`.

Implementation: `qa/spaces/home.png`, `profile.png`, `feed-final.png`, `compose-final.png`, `restricted-final.png`, `session-expired-final.png`.

Device: Android emulator at 1080×2400 physical pixels, 420 dpi (approximately 411×914 logical units, including system chrome). Comparison copies of screenshots were downscaled proportionally to 540×1200. Source board displayed at 1536×1024. Source and implementation images were opened together; only app content was compared, not the differing device frames/status bars. This is a storyboard-level comparison, not a pixel-identical viewport comparison.

Fresh composer/feed captures replaced a prior composer capture obscured by an Android input-toolbar tutorial. The gray Tools overlay is Expo Go chrome, not Sandar UI.

### Mismatches — reported, not fixed

1. **P2 — Home density and hierarchy.** The large brand header, heading and participation panel consume more initial viewport than the reference. About two cards are visible instead of the reference's three. The requested participation prompt is present, but its placement changes the approved composition.
2. **P2 — Profile layout.** Larger hero/title/spacing moves more information below the fold. Purpose is below the tabs rather than above them; the reference's compact topic/format/age chips and selected-tab underline are absent. The sticky action is visible, but the overall profile is substantially taller.
3. **P2 — Feed composition.** Large page title and full-width Share an experience CTA replace the reference's compact space header and floating create button. Cards and reaction controls are taller and expose fewer posts per viewport. Active local tabs have no visible underline.
4. **P2 — Composer controls.** Pill buttons replace the reference's two identity selection cards with avatar/icon. Heading is larger and left-aligned rather than compact/centered. A global bottom bar and extra Back to space button add vertical pressure; secondary content requires scrolling.
5. **P2 — Imagery variation.** One generated editorial image is reused across space cards; the reference uses distinct photos. The profile image matches the warm human subject direction but is not the approved photo.
6. **P3 — Typography and finishes.** Serif/sans hierarchy is retained, but heading scale/weight differs. Warm ivory, peach/sand and terracotta colors are consistent in direction; buttons are flat rather than softly graduated and controls are generally more pill-shaped.

Intentional scope/content differences are not counted as defects: no fabricated member/reaction counts, no claims of staffed moderation, no invented member avatars, no optional topic taxonomy added, and no full Events implementation. The required label remains Official Sandar Space, not Verified Community. Discover follows the written bottom-navigation requirement even though the image says Explore.

All five fidelity surfaces were checked: typography, spacing/layout, colors/tokens, imagery, and copy. Copy preserves the required low-pressure empty state and non-clinical boundary. Production safety screening/staffing remains a known deployment prerequisite, not a new failure discovered by these checks.

**Functional verification: PASS for the requested remaining checks.**

**Visual parity: NOT PASS.** The above mismatches remain by explicit instruction to report rather than redesign. No new functional blocker was observed. Standalone APK/physical-device verification was not performed.
