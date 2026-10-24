# F01/F02 visual fidelity and microinteraction pass

Scope: launch, account intent and authentication presentation only. Accepted authentication, routing, API contracts and F03/F04/F05 behavior were preserved. This work continues the existing uncommitted worktree; the other modified files in Git status predate this visual pass.

## Presentation changes

| Screen | Adjustment |
|---|---|
| Splash | Existing ivory/serif brand and botanical composition retained; no artificial delay. Native Expo launch chrome is outside the React screen. |
| Welcome | Responsive hero targets 40% of available height (180–360 dp bounds), quieter header, 23/28 serif heading, compact copy, bounded CTA spacing, staged reveal. |
| Account Intent | Neutral cards; selected peach surface, terracotta border and embedded check. Distinct Member illustration and Community image. Existing one-tap navigation preserved. |
| Member Register | Smaller constrained heading, focused/valid/invalid/disabled input styling, password-toggle feedback. |
| Community Register | Same controls and hierarchy; existing compact group banner retained. |
| Sign In | Matching typography, input states, primary/secondary hierarchy. |
| Forgot Password | Organic envelope illustration, matching form and CTA states. |
| Verification Sent | Paper-plane illustration reveal; existing resend cooldown and recovery actions preserved. |
| Verification Success | Botanical check illustration; 0.85→1 scale/opacity reveal when motion is allowed. |
| Invalid/Expired Verification | Document illustration, centered message and prominent recovery action. |
| Member Onboarding Router | Dedicated landscape photo; 3:1 banner avoids the previously cropped face. No onboarding changes. |
| Community Application Router | Dedicated laptop/window photo; matching banner, heading and CTA. No application behavior changes. |
| Session Restore | Botanical upper visual, restrained branding and existing small loader. No routing delay or invented cached name. |
| Session Expired | Doorway illustration, centered hierarchy; existing Sign in again / Back to Welcome actions preserved. |

The existing serif/native sans pair remains in use. Text scaling is not disabled or capped. Controls retain 44 dp secondary and 48 dp primary/input minimum targets. Primary white text now has 5.02:1 contrast against the existing darker terracotta #b65031, correcting the prior 4.24:1 combination. Pressed primary color darkens without fading text contrast.

## Motion and accessibility

`visual.tsx` uses React Native Animated; no dependency was added. CTA/card press uses 0.98 scale over 140 ms with ease-out, returning over 140 ms. Secondary controls have a peach pressed surface; keyboard focus has a visible outline. Reveals last 240 ms; Welcome stagger is 0/35/65/95 ms. Interaction is never blocked by an animation. No bounce, parallax, decorative loop or forced navigation delay was added.

The native reduced-motion preference defaults conservatively to enabled while loading, subscribes to subsequent changes, and removes scale/reveal animation immediately. Static selected, focus, validation and pressed-color states remain understandable. Reduced-motion behavior was tested at component level; an OS accessibility-settings/TalkBack/device matrix was not executed.

## Verification

Automated checks rerun on 2 October 2026:

| Command | Result |
|---|---|
| `npm run typecheck:mobile` | PASS |
| `npx eslint apps/mobile/src/foundation/FoundationApp.tsx apps/mobile/src/foundation/visual.tsx` | PASS |
| `npx vitest run --config vitest.foundation.config.ts` | PASS 26/26 |
| `npx vitest run tests/auth-client.test.ts tests/auth-flow.test.ts tests/destination.test.ts` | PASS 68/68 |

The 94 tests cover the requested foundation smoke paths, including restored sessions, expiry, role destinations, verification failures, recovery and reduced-motion/press behavior. No full repository, web, iOS, or unrelated feature suite was run.

Android runtime smoke completed during this pass on 28 September, using emulator-5554 and Expo Go:

- PASS: Welcome → Get Started / Sign In; Member and Community card navigation and selected appearance.
- PASS: both registration presentations; actual new Member registration → development verification email → verification success → Sign In → Member onboarding router.
- PASS: existing Community login → Community application router/destination, cold restoration and logout.
- PASS: forgot-password email → reset link → successful reset; invalid verification recovery and sent-email presentation.
- PASS: disposable Member account session revoked through the existing reset endpoint → cold start → Session Expired → Sign In.
- PASS: final cold-bundle capture repeated CTA press, intent selection and both role destinations after asset corrections.

Interrupted runs caused by a stale hot-reload bundle and an empty UI Automator tree were not counted as passes; the affected capture/smoke was rerun. No production account was used. No accepted backend behavior was modified to make these checks pass.

## Visual comparison and limits

Source: approved `ChatGPT Image Sep 27, 2026, 10_37_06 PM.png`. Comparison used actual Android captures in `docs/qa/foundation/`, including `fidelity-final-welcome`, `fidelity-final-cta-pressed`, both `fidelity-final-intent-*`, `fidelity-final-community-register`, `fidelity-final-sign-in`, both `fidelity-final-*-router`, verification/recovery captures and an Android startup recording.

Material alignment is achieved for the captured app-owned screens: image proportions, restrained headings, selected-card distinction, warm organic status illustrations, CTA contrast and the cropped router banner were corrected. This is not a claim of pixel-identical parity across all 14 native screens.

- P1: none identified in the inspected app-owned screens.
- P2: none remaining in the inspected app-owned composition. Standalone Android native splash parity remains unverified; Expo Go displays its own launch screen before React mounts. Do not treat that as a verified branded native splash.
- P3: generated assets are art-direction matches rather than the identical source artwork; native serif metrics differ from the board; the tall Pixel viewport retains more lower whitespace than the reference device. Existing localization controls, confirmation password and separate policy acknowledgements intentionally remain even where the board omits them.
- Not verified: standalone APK splash, large-font/device matrix, TalkBack and reduced-motion behavior through the actual OS setting. No delay was introduced merely to capture the transient React bootstrap screen.

## Files changed by this visual pass

- `apps/mobile/src/foundation/FoundationApp.tsx` — presentation, styles, illustrations and control wrappers only.
- `apps/mobile/src/foundation/visual.tsx` — motion preference, tactile control and reveal components.
- `tests/foundation-screen.test.jsx` — presentation mocks and three targeted interaction/accessibility regressions.
- Eight `apps/mobile/assets/fidelity-*.jpg` assets: plane, success, invalid, doorway, envelope, member, member-router, community-router.
- `docs/qa/foundation/fidelity-*.png`, this report and the appended foundation section in `design-qa.md`.

Backend, auth client, routing resolver, dependencies and shared authenticated navigation were not changed in this visual pass. No next feature was started.

### 2 October Android recheck

The emulator was initially detected and Metro started successfully on 8082; Android bundled 942 modules. Before the fresh navigation smoke began, ADB reported `device 'emulator-5554' not found`. The current-device smoke is BLOCKED, not PASS. Earlier Android evidence above remains explicitly dated. No emulator/AVD configuration was changed to bypass this interruption.
